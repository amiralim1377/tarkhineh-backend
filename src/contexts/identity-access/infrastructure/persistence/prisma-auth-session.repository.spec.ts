import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { AuthSession } from '../../domain/entities/auth-session.js';
import type {
  CreateAuthSessionInput,
  RotateRefreshTokenInput,
} from '../../domain/ports/auth-session.repository.js';
import { PrismaAuthSessionRepository } from './prisma-auth-session.repository.js';

const NOW = new Date('2026-10-19T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const SESSION_EXPIRY = new Date(NOW.getTime() + 30 * DAY);
const TOKEN_EXPIRY = new Date(NOW.getTime() + 7 * DAY);

const USER_ID = 'user-123';
const SESSION_ID = 'session-123';
const TOKEN_ID = 'refresh-token-123';

function createDomainSession(
  expiresAt: Date = SESSION_EXPIRY,
  id: string = SESSION_ID,
): AuthSession {
  const sessionTtlSeconds = (expiresAt.getTime() - NOW.getTime()) / 1000;

  return AuthSession.create({
    id,
    userId: USER_ID,
    createdAt: NOW,
    sessionTtlSeconds,
  });
}
function createTransactionMock() {
  return {
    authSession: {
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

function createPrismaMock(tx: ReturnType<typeof createTransactionMock>) {
  return {
    authSession: {
      create: vi.fn(),
    },
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
}

function createCurrentToken(overrides: Record<string, unknown> = {}) {
  return {
    id: TOKEN_ID,
    sessionId: SESSION_ID,
    expiresAt: TOKEN_EXPIRY,
    usedAt: null,
    revokedAt: null,
    csrfTokenHash: 'current-csrf-hash',
    session: {
      id: SESSION_ID,
      userId: USER_ID,
      expiresAt: SESSION_EXPIRY,
      revokedAt: null,
      user: {
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    },
    ...overrides,
  };
}

function createRotationInput(
  overrides: Partial<RotateRefreshTokenInput> = {},
): RotateRefreshTokenInput {
  return {
    currentTokenHash: 'current-hash',
    currentCsrfTokenHash: 'current-csrf-hash',
    replacementTokenHash: 'replacement-hash',
    replacementCsrfTokenHash: 'replacement-csrf-hash',
    now: NOW,
    replacementExpiresAt: TOKEN_EXPIRY,
    ...overrides,
  };
}

describe('PrismaAuthSessionRepository', () => {
  describe('createSession', () => {
    it('persists the AuthSession entity and its initial refresh token in one nested Prisma write', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      prisma.authSession.create.mockResolvedValue({
        id: SESSION_ID,
        expiresAt: SESSION_EXPIRY,
        refreshTokens: [{ expiresAt: TOKEN_EXPIRY }],
      });

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const session = createDomainSession();

      const input: CreateAuthSessionInput = {
        session,
        initialRefreshTokenHash: 'initial-token-hash',
        csrfTokenHash: 'csrf-hash',
        refreshTokenExpiresAt: TOKEN_EXPIRY,
      };

      const result = await repository.createSession(input);

      expect(result).toEqual({
        sessionId: SESSION_ID,
        sessionExpiresAt: SESSION_EXPIRY,
        refreshTokenExpiresAt: TOKEN_EXPIRY,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.authSession.create).toHaveBeenCalledOnce();

      expect(prisma.authSession.create).toHaveBeenCalledWith({
        data: {
          id: SESSION_ID,
          userId: USER_ID,
          createdAt: NOW,
          lastUsedAt: NOW,
          expiresAt: SESSION_EXPIRY,
          refreshTokens: {
            create: {
              tokenHash: 'initial-token-hash',
              csrfTokenHash: 'csrf-hash',
              createdAt: NOW,
              expiresAt: TOKEN_EXPIRY,
            },
          },
        },
        select: {
          id: true,
          expiresAt: true,
          refreshTokens: {
            select: { expiresAt: true },
          },
        },
      });
    });

    it('rejects a refresh token that outlives its session', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);
      const shortSessionExpiry = new Date(NOW.getTime() + DAY);

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const session = createDomainSession(shortSessionExpiry);

      await expect(
        repository.createSession({
          session,
          initialRefreshTokenHash: 'initial-token-hash',
          csrfTokenHash: 'csrf-hash',
          refreshTokenExpiresAt: TOKEN_EXPIRY,
        }),
      ).rejects.toThrow(RangeError);

      expect(prisma.authSession.create).not.toHaveBeenCalled();
    });

    it('rejects a refresh token that is expired at session creation', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const session = createDomainSession();

      await expect(
        repository.createSession({
          session,
          initialRefreshTokenHash: 'initial-token-hash',
          csrfTokenHash: 'csrf-hash',
          refreshTokenExpiresAt: NOW,
        }),
      ).rejects.toThrow(RangeError);

      expect(prisma.authSession.create).not.toHaveBeenCalled();
    });
  });

  describe('rotateRefreshToken', () => {
    it('rotates a valid token and records its replacement', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);
      const replacementExpiry = new Date(NOW.getTime() + 5 * DAY);

      tx.refreshToken.findUnique.mockResolvedValue(createCurrentToken());
      tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      tx.refreshToken.create.mockResolvedValue({
        id: 'replacement-token-123',
        expiresAt: replacementExpiry,
      });
      tx.refreshToken.update.mockResolvedValue({});
      tx.authSession.updateMany.mockResolvedValue({ count: 1 });

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.rotateRefreshToken(
        createRotationInput({
          replacementExpiresAt: replacementExpiry,
        }),
      );

      expect(result).toEqual({
        status: 'ROTATED',
        userId: USER_ID,
        sessionId: SESSION_ID,
        sessionExpiresAt: SESSION_EXPIRY,
        refreshTokenExpiresAt: replacementExpiry,
      });

      expect(prisma.$transaction).toHaveBeenCalledOnce();

      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TOKEN_ID,
            tokenHash: 'current-hash',
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: NOW },
          }),
          data: { usedAt: NOW },
        }),
      );

      expect(tx.refreshToken.create).toHaveBeenCalledWith({
        data: {
          sessionId: SESSION_ID,
          tokenHash: 'replacement-hash',
          csrfTokenHash: 'replacement-csrf-hash',
          createdAt: NOW,
          expiresAt: replacementExpiry,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

      expect(tx.refreshToken.update).toHaveBeenCalledWith({
        where: { id: TOKEN_ID },
        data: { replacedByTokenId: 'replacement-token-123' },
      });
    });

    it('rejects an unknown refresh token without modifying state', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique.mockResolvedValue(null);

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.rotateRefreshToken(createRotationInput());

      expect(result).toEqual({ status: 'INVALID' });
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a mismatched CSRF token without modifying session state', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique.mockResolvedValue(createCurrentToken());

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.rotateRefreshToken(
        createRotationInput({
          currentCsrfTokenHash: 'wrong-csrf-hash',
        }),
      );

      expect(result).toEqual({ status: 'INVALID' });
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
      expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired refresh token', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique.mockResolvedValue(
        createCurrentToken({
          expiresAt: new Date(NOW.getTime() - 1),
        }),
      );

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.rotateRefreshToken(createRotationInput());

      expect(result).toEqual({ status: 'INVALID' });
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes the active session when a consumed token is reused', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique.mockResolvedValue(
        createCurrentToken({
          usedAt: new Date(NOW.getTime() - 1000),
        }),
      );

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.rotateRefreshToken(createRotationInput());

      expect(result).toEqual({ status: 'REUSE_DETECTED' });

      expect(tx.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: SESSION_ID,
          revokedAt: null,
          expiresAt: { gt: NOW },
        },
        data: {
          revokedAt: NOW,
          revocationReason: 'REFRESH_TOKEN_REUSE',
        },
      });

      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          sessionId: SESSION_ID,
          revokedAt: null,
        },
        data: {
          revokedAt: NOW,
        },
      });

      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('detects a token consumed by a concurrent request', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique
        .mockResolvedValueOnce(createCurrentToken())
        .mockResolvedValueOnce({
          usedAt: new Date(NOW.getTime() + 1),
          csrfTokenHash: 'current-csrf-hash',
          session: {
            expiresAt: SESSION_EXPIRY,
            revokedAt: null,
          },
        });

      tx.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      tx.authSession.updateMany.mockResolvedValue({ count: 1 });

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.rotateRefreshToken(createRotationInput());

      expect(result).toEqual({ status: 'REUSE_DETECTED' });
      expect(tx.refreshToken.findUnique).toHaveBeenCalledTimes(2);
      expect(tx.refreshToken.create).not.toHaveBeenCalled();

      expect(tx.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            revokedAt: NOW,
            revocationReason: 'REFRESH_TOKEN_REUSE',
          },
        }),
      );
    });
  });

  describe('revokeSessionByTokenHash', () => {
    it('revokes the session and its remaining refresh tokens', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique.mockResolvedValue({
        sessionId: SESSION_ID,
        csrfTokenHash: 'current-csrf-hash',
      });

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.revokeSessionByTokenHash(
        'logout-token-hash',
        'current-csrf-hash',
        NOW,
      );

      expect(result).toBe(true);

      expect(tx.authSession.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION_ID, revokedAt: null },
        data: {
          revokedAt: NOW,
          revocationReason: 'LOGOUT',
        },
      });

      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          sessionId: SESSION_ID,
          revokedAt: null,
        },
        data: { revokedAt: NOW },
      });
    });

    it('returns false for an unknown token hash', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.refreshToken.findUnique.mockResolvedValue(null);

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.revokeSessionByTokenHash(
        'unknown-token-hash',
        'current-csrf-hash',
        NOW,
      );

      expect(result).toBe(false);
      expect(tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllSessionsForUser', () => {
    it('revokes all active sessions and their refresh tokens for a user', async () => {
      const tx = createTransactionMock();
      const prisma = createPrismaMock(tx);

      tx.authSession.updateMany.mockResolvedValue({ count: 2 });

      const repository = new PrismaAuthSessionRepository(
        prisma as unknown as PrismaService,
      );

      const result = await repository.revokeAllSessionsForUser(
        USER_ID,
        'SECURITY_ACTION',
        NOW,
      );

      expect(result).toBe(2);

      expect(tx.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          revokedAt: null,
        },
        data: {
          revokedAt: NOW,
          revocationReason: 'SECURITY_ACTION',
        },
      });

      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          revokedAt: null,
          session: {
            is: { userId: USER_ID },
          },
        },
        data: { revokedAt: NOW },
      });
    });
  });
});
