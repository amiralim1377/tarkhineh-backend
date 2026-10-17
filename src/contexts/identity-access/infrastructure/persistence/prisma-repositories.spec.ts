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

describe('Prisma repositories: error handling', () => {
  it('handles a duplicate email without exposing database errors', async () => {
    const duplicateEmailError = createPrismaError('P2002', ['email']);

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(duplicateEmailError),
      },
      emailVerificationChallenge: {
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
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    expect(result).toBe(false);
  });

  it('does not swallow a duplicate token-hash error as a duplicate email', async () => {
    const duplicateTokenError = createPrismaError('P2002', ['tokenHash']);

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-123' }),
      },
      emailVerificationChallenge: {
        updateMany: vi.fn(),
        create: vi.fn().mockRejectedValue(duplicateTokenError),
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
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
    ).rejects.toBe(duplicateTokenError);
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
