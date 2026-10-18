import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';

import { PrismaEmailRegistrationRepository } from './prisma-email-registration.repository.js';
import { PrismaUserAuthenticationRepository } from './prisma-user-authentication.repository.js';

function createPrismaError(
  code: string,
  target?: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Test Prisma error: ${code}`,
    {
      code,
      clientVersion: 'test-version',
      ...(target ? { meta: { target } } : {}),
    },
  );
}

describe('Prisma repositories: error handling and email outbox', () => {
  it('handles a duplicate email without exposing database errors', async () => {
    const duplicateEmailError = createPrismaError('P2002', ['email']);

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(duplicateEmailError),
      },
      emailVerificationChallenge: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      emailOutboxMessage: {
        updateMany: vi.fn(),
        create: vi.fn(),
      },
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    const result = await repository.createPendingRegistration({
      email: 'customer@example.com',
      passwordHash: 'test-hash',
      displayName: 'Customer',
      tokenHash: 'test-token-hash',
      encryptedToken: 'v1:encrypted-test-payload',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    expect(result).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.emailVerificationChallenge.create).not.toHaveBeenCalled();
    expect(tx.emailOutboxMessage.create).not.toHaveBeenCalled();
  });

  it('does not swallow a duplicate token-hash error as a duplicate email', async () => {
    const duplicateTokenError = createPrismaError('P2002', ['tokenHash']);

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-123' }),
      },
      emailVerificationChallenge: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn().mockRejectedValue(duplicateTokenError),
      },
      emailOutboxMessage: {
        updateMany: vi.fn(),
        create: vi.fn(),
      },
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    await expect(
      repository.createPendingRegistration({
        email: 'customer@example.com',
        passwordHash: 'test-hash',
        displayName: 'Customer',
        tokenHash: 'test-token-hash',
        encryptedToken: 'v1:encrypted-test-payload',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
    ).rejects.toBe(duplicateTokenError);

    expect(tx.emailOutboxMessage.create).not.toHaveBeenCalled();
  });

  it('creates the user, verification challenge and outbox message in one transaction', async () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-123' }),
      },
      emailVerificationChallenge: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'challenge-123' }),
      },
      emailOutboxMessage: {
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'outbox-123' }),
      },
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    const result = await repository.createPendingRegistration({
      email: 'customer@example.com',
      passwordHash: 'test-hash',
      displayName: 'Customer',
      tokenHash: 'test-token-hash',
      encryptedToken: 'v1:encrypted-test-payload',
      expiresAt,
    });

    expect(result).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'customer@example.com',
        passwordHash: 'test-hash',
        displayName: 'Customer',
        status: 'PENDING',
      },
      select: { id: true },
    });

    expect(tx.emailVerificationChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-123',
        email: 'customer@example.com',
        tokenHash: 'test-token-hash',
        expiresAt,
      },
      select: { id: true },
    });

    expect(tx.emailOutboxMessage.create).toHaveBeenCalledWith({
      data: {
        challengeId: 'challenge-123',
        encryptedToken: 'v1:encrypted-test-payload',
      },
    });
  });

  it('cancels old outbox messages before creating a replacement challenge', async () => {
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-123',
          emailVerifiedAt: null,
          status: 'PENDING',
        }),
        create: vi.fn(),
      },
      emailVerificationChallenge: {
        findMany: vi.fn().mockResolvedValue([{ id: 'old-challenge-123' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({
          id: 'new-challenge-123',
        }),
      },
      emailOutboxMessage: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({
          id: 'new-outbox-123',
        }),
      },
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    const result = await repository.createPendingRegistration({
      email: 'customer@example.com',
      passwordHash: 'new-test-hash',
      displayName: 'Customer',
      tokenHash: 'new-test-token-hash',
      encryptedToken: 'v1:new-encrypted-payload',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    expect(result).toBe(true);
    expect(tx.user.create).not.toHaveBeenCalled();

    expect(tx.emailVerificationChallenge.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        consumedAt: null,
      },
      select: {
        id: true,
      },
    });

    expect(tx.emailOutboxMessage.updateMany).toHaveBeenCalledWith({
      where: {
        challengeId: {
          in: ['old-challenge-123'],
        },
        status: {
          in: ['PENDING', 'QUEUED'],
        },
      },
      data: {
        status: 'CANCELLED',
        encryptedToken: null,
      },
    });

    expect(tx.emailVerificationChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        consumedAt: null,
      },
      data: {
        consumedAt: expect.any(Date),
      },
    });

    expect(tx.emailOutboxMessage.create).toHaveBeenCalledWith({
      data: {
        challengeId: 'new-challenge-123',
        encryptedToken: 'v1:new-encrypted-payload',
      },
    });

    expect(
      tx.emailOutboxMessage.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.emailVerificationChallenge.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('normalizes a recognized database connectivity error', async () => {
    const databaseError = createPrismaError('P2024');

    const prisma = {
      user: {
        findUnique: vi.fn().mockRejectedValue(databaseError),
      },
    } as unknown as PrismaService;

    const repository = new PrismaUserAuthenticationRepository(prisma);

    let caughtError: unknown;

    try {
      await repository.findByEmail('customer@example.com');
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(DependencyUnavailableError);

    if (!(caughtError instanceof DependencyUnavailableError)) {
      throw new Error('Expected DependencyUnavailableError');
    }

    expect(caughtError.code).toBe('COMMON.DEPENDENCY_UNAVAILABLE');
    expect(caughtError.cause).toBe(databaseError);
  });
});
