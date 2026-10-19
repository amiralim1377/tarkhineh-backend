import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import type {
  AuthSessionRepository,
  CreateAuthSessionInput,
  CreatedAuthSession,
  RefreshTokenRotationResult,
  RotateRefreshTokenInput,
  SessionRevocationReason,
} from '../../domain/ports/auth-session.repository.js';

class SessionStateChangedError extends Error {
  constructor() {
    super('Authentication session state changed during token rotation');
    this.name = 'SessionStateChangedError';
  }
}

@Injectable()
export class PrismaAuthSessionRepository implements AuthSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    input: CreateAuthSessionInput,
  ): Promise<CreatedAuthSession> {
    const { now, sessionExpiresAt } = input;
    const refreshTokenExpiresAt = new Date(
      Math.min(
        input.refreshTokenExpiresAt.getTime(),
        sessionExpiresAt.getTime(),
      ),
    );

    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isFinite(sessionExpiresAt.getTime()) ||
      !Number.isFinite(refreshTokenExpiresAt.getTime()) ||
      sessionExpiresAt <= now ||
      refreshTokenExpiresAt <= now
    ) {
      throw new RangeError('Authentication session expiry dates are invalid');
    }

    try {
      const session = await this.prisma.authSession.create({
        data: {
          userId: input.userId,
          createdAt: now,
          lastUsedAt: now,
          expiresAt: sessionExpiresAt,
          refreshTokens: {
            create: {
              tokenHash: input.initialRefreshTokenHash,
              csrfTokenHash: input.csrfTokenHash,
              createdAt: now,
              expiresAt: refreshTokenExpiresAt,
            },
          },
        },
        select: {
          id: true,
          expiresAt: true,
          refreshTokens: {
            select: {
              expiresAt: true,
            },
          },
        },
      });

      const initialToken = session.refreshTokens[0];

      if (!initialToken) {
        throw new Error('Initial refresh token was not created');
      }

      return {
        sessionId: session.id,
        sessionExpiresAt: session.expiresAt,
        refreshTokenExpiresAt: initialToken.expiresAt,
      };
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshTokenRotationResult> {
    const { now } = input;

    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isFinite(input.replacementExpiresAt.getTime())
    ) {
      return { status: 'INVALID' };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash: input.currentTokenHash },
          select: {
            id: true,
            sessionId: true,
            csrfTokenHash: true,
            expiresAt: true,
            usedAt: true,
            revokedAt: true,
            session: {
              select: {
                id: true,
                userId: true,
                expiresAt: true,
                revokedAt: true,
                user: {
                  select: {
                    status: true,
                    emailVerifiedAt: true,
                  },
                },
              },
            },
          },
        });

        if (!token) {
          return { status: 'INVALID' };
        }

        const session = token.session;

        if (
          session.revokedAt !== null ||
          session.expiresAt <= now
        ) {
          return { status: 'INVALID' };
        }

        // Validate CSRF against this exact token generation.
        if (token.csrfTokenHash !== input.currentCsrfTokenHash) {
          return { status: 'INVALID' };
        }

        const revokeSession = async (
          reason: SessionRevocationReason,
        ): Promise<boolean> => {
          const revoked = await tx.authSession.updateMany({
            where: {
              id: session.id,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              revokedAt: now,
              revocationReason: reason,
            },
          });

          if (revoked.count !== 1) {
            return false;
          }

          await tx.refreshToken.updateMany({
            where: {
              sessionId: session.id,
              revokedAt: null,
            },
            data: {
              revokedAt: now,
            },
          });

          return true;
        };

        if (token.usedAt !== null) {
          const revoked = await revokeSession('REFRESH_TOKEN_REUSE');

          return {
            status: revoked ? 'REUSE_DETECTED' : 'INVALID',
          };
        }

        if (
          token.revokedAt !== null ||
          token.expiresAt <= now
        ) {
          return { status: 'INVALID' };
        }

        if (
          session.user.status !== 'ACTIVE' ||
          session.user.emailVerifiedAt === null
        ) {
          await revokeSession('SECURITY_ACTION');
          return { status: 'INVALID' };
        }

        const replacementExpiresAt = new Date(
          Math.min(
            input.replacementExpiresAt.getTime(),
            session.expiresAt.getTime(),
          ),
        );

        if (replacementExpiresAt <= now) {
          return { status: 'INVALID' };
        }

        // Compare-and-set: only one request can consume the current token.
        const consumed = await tx.refreshToken.updateMany({
          where: {
            id: token.id,
            tokenHash: input.currentTokenHash,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
            csrfTokenHash: input.currentCsrfTokenHash,
            session: {
              is: {
                revokedAt: null,
                expiresAt: { gt: now },
                user: {
                  is: {
                    status: 'ACTIVE',
                    emailVerifiedAt: { not: null },
                  },
                },
              },
            },
          },
          data: {
            usedAt: now,
          },
        });

        if (consumed.count !== 1) {
          // A concurrent request may have consumed this token first.
          const latest = await tx.refreshToken.findUnique({
            where: { id: token.id },
            select: {
              usedAt: true,
              csrfTokenHash: true,
              session: {
                select: {
                  expiresAt: true,
                  revokedAt: true,
                },
              },
            },
          });

          if (
            latest &&
            latest.usedAt !== null &&
            latest.csrfTokenHash === input.currentCsrfTokenHash &&
            latest.session.revokedAt === null &&
            latest.session.expiresAt > now
          ) {
            const revoked = await revokeSession('REFRESH_TOKEN_REUSE');

            return {
              status: revoked ? 'REUSE_DETECTED' : 'INVALID',
            };
          }

          return { status: 'INVALID' };
        }

        const replacement = await tx.refreshToken.create({
          data: {
            sessionId: session.id,
            tokenHash: input.replacementTokenHash,
            csrfTokenHash: input.replacementCsrfTokenHash,
            createdAt: now,
            expiresAt: replacementExpiresAt,
          },
          select: {
            id: true,
            expiresAt: true,
          },
        });

        await tx.refreshToken.update({
          where: { id: token.id },
          data: {
            replacedByTokenId: replacement.id,
          },
        });

        const sessionUpdated = await tx.authSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            lastUsedAt: now,
          },
        });

        if (sessionUpdated.count !== 1) {
          // Throwing rolls back consumption and replacement creation.
          throw new SessionStateChangedError();
        }

        return {
          status: 'ROTATED',
          userId: session.userId,
          sessionId: session.id,
          sessionExpiresAt: session.expiresAt,
          refreshTokenExpiresAt: replacement.expiresAt,
        };
      });
    } catch (error: unknown) {
      if (error instanceof SessionStateChangedError) {
        return { status: 'INVALID' };
      }

      throw normalizePrismaError(error);
    }
  }

  async revokeSessionByTokenHash(
    tokenHash: string,
    csrfTokenHash: string,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash },
          select: {
            sessionId: true,
            csrfTokenHash: true,
          },
        });

        if (!token || token.csrfTokenHash !== csrfTokenHash) {
          return false;
        }

        const revoked = await tx.authSession.updateMany({
          where: {
            id: token.sessionId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revocationReason: 'LOGOUT',
          },
        });

        // Keep token records revoked even if the session was already revoked.
        await tx.refreshToken.updateMany({
          where: {
            sessionId: token.sessionId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        return revoked.count === 1;
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async revokeAllSessionsForUser(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const revokedSessions = await tx.authSession.updateMany({
          where: {
            userId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revocationReason: reason,
          },
        });

        await tx.refreshToken.updateMany({
          where: {
            revokedAt: null,
            session: {
              is: { userId },
            },
          },
          data: {
            revokedAt: now,
          },
        });

        return revokedSessions.count;
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
