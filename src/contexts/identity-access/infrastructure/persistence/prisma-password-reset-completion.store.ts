import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { IdentityUser } from '../../domain/entities/identity-user.js';

import type {
  PasswordResetCompletionStore,
  PasswordResetCompletionStoreInput,
} from '../../application/ports/password-reset-completion-store.port.js';

interface PasswordResetChallengeRow {
  id: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}

interface LockedResetUserRow {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

const CANCELLABLE_OUTBOUND_STATUSES = [
  'PENDING',
  'DISPATCHING',
  'QUEUED',
  'RETRY_SCHEDULED',
] as const;

@Injectable()
export class PrismaPasswordResetCompletionStore implements PasswordResetCompletionStore {
  constructor(private readonly prisma: PrismaService) {}

  private validateInput(input: PasswordResetCompletionStoreInput): void {
    if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) {
      throw new TypeError('Password reset token hash is invalid.');
    }

    if (!input.passwordHash.trim()) {
      throw new TypeError('Password reset password hash must not be empty.');
    }

    if (!Number.isFinite(input.now.getTime())) {
      throw new RangeError('Password reset timestamp is invalid.');
    }
  }

  async completePasswordReset(
    input: PasswordResetCompletionStoreInput,
  ): Promise<boolean> {
    this.validateInput(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Find the challenge without locking it yet.
        const candidate = await tx.passwordResetChallenge.findUnique({
          where: {
            tokenHash: input.tokenHash,
          },
          select: {
            id: true,
            userId: true,
          },
        });

        if (!candidate) {
          return false;
        }

        // 2. Lock the User first, following the existing lock order.
        const userRows = await tx.$queryRaw<LockedResetUserRow[]>`
          SELECT
            "id",
            "email",
            "emailVerifiedAt",
            "passwordHash",
            "displayName",
            "status"
          FROM "User"
          WHERE "id" = ${candidate.userId}
          FOR UPDATE
        `;

        const user = userRows[0];

        if (!user) {
          return false;
        }

        // Reuse the Domain Entity's password-login eligibility rule.
        const identityUser = IdentityUser.reconstitute({
          id: user.id,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          status: user.status,
        });

        if (!identityUser.canLoginWithPassword()) {
          return false;
        }

        // 3. Lock and re-read the challenge after locking the User.
        const challengeRows = await tx.$queryRaw<PasswordResetChallengeRow[]>`
            SELECT
              "id",
              "userId",
              "expiresAt",
              "consumedAt",
              "invalidatedAt"
            FROM "PasswordResetChallenge"
            WHERE "id" = ${candidate.id}
              AND "tokenHash" = ${input.tokenHash}
            FOR UPDATE
          `;

        const challenge = challengeRows[0];

        if (
          !challenge ||
          challenge.userId !== identityUser.id ||
          challenge.consumedAt !== null ||
          challenge.invalidatedAt !== null ||
          challenge.expiresAt <= input.now
        ) {
          return false;
        }

        // 4. Consume the token with a conditional update.
        const consumed = await tx.passwordResetChallenge.updateMany({
          where: {
            id: challenge.id,
            userId: identityUser.id,
            tokenHash: input.tokenHash,
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: {
              gt: input.now,
            },
          },
          data: {
            consumedAt: input.now,
          },
        });

        if (consumed.count !== 1) {
          return false;
        }

        // 5. Invalidate any other still-active reset challenges.
        const otherChallenges = await tx.passwordResetChallenge.findMany({
          where: {
            userId: identityUser.id,
            id: {
              not: challenge.id,
            },
            consumedAt: null,
            invalidatedAt: null,
          },
          select: {
            id: true,
          },
        });

        const otherChallengeIds = otherChallenges.map((item) => item.id);

        if (otherChallengeIds.length > 0) {
          await tx.passwordResetChallenge.updateMany({
            where: {
              id: {
                in: otherChallengeIds,
              },
              consumedAt: null,
              invalidatedAt: null,
            },
            data: {
              invalidatedAt: input.now,
            },
          });

          // Cancel emails that have not entered active delivery processing.
          await tx.outboundEmailMessage.updateMany({
            where: {
              aggregateType: 'PasswordResetChallenge',
              aggregateId: {
                in: otherChallengeIds,
              },
              status: {
                in: [...CANCELLABLE_OUTBOUND_STATUSES],
              },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: input.now,
              encryptedPayload: null,
              lockedBy: null,
              lockedUntil: null,
              lastErrorCode: 'CHALLENGE_SUPERSEDED',
            },
          });

          // Do not automatically retry messages with unknown provider outcomes.
          await tx.outboundEmailMessage.updateMany({
            where: {
              aggregateType: 'PasswordResetChallenge',
              aggregateId: {
                in: otherChallengeIds,
              },
              status: 'OUTCOME_UNKNOWN',
            },
            data: {
              encryptedPayload: null,
            },
          });
        }

        // 6. Update the password.
        await tx.user.update({
          where: {
            id: identityUser.id,
          },
          data: {
            passwordHash: input.passwordHash,
          },
        });

        // 7. Revoke all active sessions.
        await tx.authSession.updateMany({
          where: {
            userId: identityUser.id,
            revokedAt: null,
          },
          data: {
            revokedAt: input.now,
            revocationReason: 'SECURITY_ACTION',
          },
        });

        // 8. Revoke all refresh tokens belonging to this user.
        await tx.refreshToken.updateMany({
          where: {
            revokedAt: null,
            session: {
              is: {
                userId: identityUser.id,
              },
            },
          },
          data: {
            revokedAt: input.now,
          },
        });

        // 9. Cancel pending delivery of the consumed challenge's email.
        await tx.outboundEmailMessage.updateMany({
          where: {
            aggregateType: 'PasswordResetChallenge',
            aggregateId: challenge.id,
            status: {
              in: [...CANCELLABLE_OUTBOUND_STATUSES],
            },
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: input.now,
            encryptedPayload: null,
            lockedBy: null,
            lockedUntil: null,
            lastErrorCode: 'CHALLENGE_INELIGIBLE',
          },
        });

        // Remove the sensitive payload from messages with unknown outcomes.
        await tx.outboundEmailMessage.updateMany({
          where: {
            aggregateType: 'PasswordResetChallenge',
            aggregateId: challenge.id,
            status: 'OUTCOME_UNKNOWN',
          },
          data: {
            encryptedPayload: null,
          },
        });

        return true;
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
