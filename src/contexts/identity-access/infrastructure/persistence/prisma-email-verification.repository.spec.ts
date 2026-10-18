import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { PrismaEmailVerificationRepository } from './prisma-email-verification.repository.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function createChallenge(
  overrides: {
    expiresAt?: Date;
    consumedAt?: Date | null;
    userEmail?: string | null;
    emailVerifiedAt?: Date | null;
    status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  } = {},
) {
  return {
    id: 'challenge-123',
    userId: 'user-123',
    email: 'customer@example.com',
    expiresAt: overrides.expiresAt ?? new Date('2026-10-18T13:00:00.000Z'),
    consumedAt:
      overrides.consumedAt !== undefined ? overrides.consumedAt : null,
    user: {
      id: 'user-123',
      email:
        overrides.userEmail !== undefined
          ? overrides.userEmail
          : 'customer@example.com',
      emailVerifiedAt:
        overrides.emailVerifiedAt !== undefined
          ? overrides.emailVerifiedAt
          : null,
      passwordHash: 'test-hash',
      displayName: 'Customer',
      status: overrides.status ?? 'PENDING',
    },
  };
}

function createHarness(
  options: {
    challenge?: ReturnType<typeof createChallenge> | null;
    consumeCount?: number;
    activateCount?: number;
  } = {},
) {
  const challenge =
    options.challenge === undefined ? createChallenge() : options.challenge;

  const tx = {
    emailVerificationChallenge: {
      findUnique: vi.fn().mockResolvedValue(challenge),
      updateMany: vi.fn().mockResolvedValue({
        count: options.consumeCount ?? 1,
      }),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({
        count: options.activateCount ?? 1,
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  } as unknown as PrismaService;

  const repository = new PrismaEmailVerificationRepository(prisma);

  return { prisma, tx, repository };
}

describe('PrismaEmailVerificationRepository', () => {
  it('consumes a valid token and activates the user', async () => {
    const { prisma, tx, repository } = createHarness();

    const result = await repository.verifyByTokenHash('valid-token-hash', NOW);

    expect(result).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    expect(tx.emailVerificationChallenge.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'valid-token-hash' },
      select: {
        id: true,
        userId: true,
        email: true,
        expiresAt: true,
        consumedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            passwordHash: true,
            displayName: true,
            status: true,
          },
        },
      },
    });

    expect(tx.emailVerificationChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'challenge-123',
        tokenHash: 'valid-token-hash',
        consumedAt: null,
        expiresAt: { gt: NOW },
      },
      data: {
        consumedAt: NOW,
      },
    });

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-123',
        status: 'PENDING',
        emailVerifiedAt: null,
        email: 'customer@example.com',
      },
      data: {
        status: 'ACTIVE',
        emailVerifiedAt: NOW,
      },
    });
  });

  it('returns false when the token does not exist', async () => {
    const { tx, repository } = createHarness({
      challenge: null,
    });

    const result = await repository.verifyByTokenHash(
      'unknown-token-hash',
      NOW,
    );

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the token has expired', async () => {
    const { tx, repository } = createHarness({
      challenge: createChallenge({
        expiresAt: new Date('2026-10-18T11:00:00.000Z'),
      }),
    });

    const result = await repository.verifyByTokenHash(
      'expired-token-hash',
      NOW,
    );

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the token has already been consumed', async () => {
    const { tx, repository } = createHarness({
      challenge: createChallenge({
        consumedAt: new Date('2026-10-18T11:30:00.000Z'),
      }),
    });

    const result = await repository.verifyByTokenHash(
      'consumed-token-hash',
      NOW,
    );

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('does not activate the user if another request consumes the token first', async () => {
    const { tx, repository } = createHarness({
      consumeCount: 0,
    });

    const result = await repository.verifyByTokenHash('racing-token-hash', NOW);

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).toHaveBeenCalledOnce();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns false if the account can no longer be activated', async () => {
    const { tx, repository } = createHarness({
      activateCount: 0,
    });

    const result = await repository.verifyByTokenHash('valid-token-hash', NOW);

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).toHaveBeenCalledOnce();
    expect(tx.user.updateMany).toHaveBeenCalledOnce();
  });

  it('rejects a challenge whose email no longer matches the user', async () => {
    const { tx, repository } = createHarness({
      challenge: createChallenge({
        userEmail: 'different@example.com',
      }),
    });

    const result = await repository.verifyByTokenHash('token-hash', NOW);

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('does not re-verify an already active user', async () => {
    const { tx, repository } = createHarness({
      challenge: createChallenge({
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-10-18T11:00:00.000Z'),
      }),
    });

    const result = await repository.verifyByTokenHash(
      'already-verified-token-hash',
      NOW,
    );

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('does not verify a suspended user', async () => {
    const { tx, repository } = createHarness({
      challenge: createChallenge({
        status: 'SUSPENDED',
      }),
    });

    const result = await repository.verifyByTokenHash(
      'suspended-user-token-hash',
      NOW,
    );

    expect(result).toBe(false);
    expect(tx.emailVerificationChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});
