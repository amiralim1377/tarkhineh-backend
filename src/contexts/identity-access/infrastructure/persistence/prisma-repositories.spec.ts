import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';

import { IdentityUser } from '../../domain/entities/identity-user.js';
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

function createPendingIdentityUser(
  email = 'customer@example.com',
  passwordHash = 'test-hash',
  displayName: string | null = 'Customer',
  id?: string,
): IdentityUser {
  return IdentityUser.registerPending({
    ...(id !== undefined ? { id } : {}),
    email,
    passwordHash,
    displayName,
  });
}

describe('Prisma repositories: error handling and email registration', () => {
  it('handles a duplicate email without exposing database errors', async () => {
    const duplicateEmailError = createPrismaError('P2002', ['email']);
    const user = createPendingIdentityUser(
      'customer@example.com',
      'test-hash',
      'Customer',
      'user-123',
    );
    const now = new Date();

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
      outboundEmailMessage: {
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    const result = await repository.createPendingRegistration({
      user,
      tokenHash: 'test-token-hash',
      encryptedPayload: 'v1:encrypted-test-payload',
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      now,
    });

    expect(result).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledOnce();
    expect(tx.emailVerificationChallenge.create).not.toHaveBeenCalled();
    expect(tx.outboundEmailMessage.create).not.toHaveBeenCalled();
  });

  it('does not swallow a duplicate token-hash error as a duplicate email', async () => {
    const duplicateTokenError = createPrismaError('P2002', ['tokenHash']);
    const user = createPendingIdentityUser(
      'customer@example.com',
      'test-hash',
      'Customer',
      'user-123',
    );
    const now = new Date();

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: user.id }),
      },
      emailVerificationChallenge: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn().mockRejectedValue(duplicateTokenError),
      },
      outboundEmailMessage: {
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      $queryRaw: vi.fn(),
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
        user,
        tokenHash: 'test-token-hash',
        encryptedPayload: 'v1:encrypted-test-payload',
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        now,
      }),
    ).rejects.toBe(duplicateTokenError);

    expect(tx.user.create).toHaveBeenCalledOnce();
    expect(tx.emailVerificationChallenge.create).toHaveBeenCalledOnce();
    expect(tx.outboundEmailMessage.create).not.toHaveBeenCalled();
  });

  it('creates the user, verification challenge and outbound email message in one transaction', async () => {
    const now = new Date('2026-10-24T10:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const encryptedPayload = 'v1:encrypted-test-payload';
    const user = createPendingIdentityUser(
      'customer@example.com',
      'test-hash',
      'Customer',
      'user-123',
    );

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: user.id }),
      },
      emailVerificationChallenge: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'challenge-123' }),
      },
      outboundEmailMessage: {
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'outbound-message-123' }),
      },
      $queryRaw: vi.fn(),
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    const result = await repository.createPendingRegistration({
      user,
      tokenHash: 'test-token-hash',
      encryptedPayload,
      expiresAt,
      now,
    });

    expect(result).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        id: user.id,
        email: 'customer@example.com',
        passwordHash: 'test-hash',
        displayName: 'Customer',
        status: 'PENDING',
      },
      select: { id: true },
    });

    expect(tx.emailVerificationChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        email: 'customer@example.com',
        tokenHash: 'test-token-hash',
        expiresAt,
      },
      select: { id: true },
    });

    expect(tx.outboundEmailMessage.create).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'email-verification:challenge-123',
        lane: 'TRANSACTIONAL',
        templateKey: 'identity.email-verification',
        payloadVersion: 1,
        encryptedPayload,
        status: 'PENDING',
        availableAt: now,
        validUntil: expiresAt,
        aggregateType: 'EmailVerificationChallenge',
        aggregateId: 'challenge-123',
      },
    });
  });

  it('cancels old outbound email messages before creating a replacement challenge', async () => {
    const now = new Date('2026-10-24T10:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const encryptedPayload = 'v1:new-encrypted-payload';
    const user = createPendingIdentityUser(
      'customer@example.com',
      'new-test-hash',
      'Customer',
      'user-123',
    );

    const tx = {
      user: {
        // First read locates the existing user by email; the second read
        // refreshes eligibility after the User row lock has been acquired.
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: user.id })
          .mockResolvedValueOnce({
            id: user.id,
            email: 'customer@example.com',
            emailVerifiedAt: null,
            status: 'PENDING',
          }),
        create: vi.fn(),
      },
      emailVerificationChallenge: {
        findMany: vi.fn().mockResolvedValue([{ id: 'old-challenge-123' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'new-challenge-123' }),
      },
      outboundEmailMessage: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'new-outbound-message-123' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: user.id }]),
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const repository = new PrismaEmailRegistrationRepository(prisma);

    const result = await repository.createPendingRegistration({
      user,
      tokenHash: 'new-test-token-hash',
      encryptedPayload,
      expiresAt,
      now,
    });

    expect(result).toBe(true);
    expect(tx.user.create).not.toHaveBeenCalled();

    expect(tx.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { email: 'customer@example.com' },
      select: { id: true },
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    const lockSql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as
      TemplateStringsArray | string;
    expect(
      Array.isArray(lockSql) ? lockSql.join(' ') : String(lockSql),
    ).toContain('FOR UPDATE');

    expect(tx.emailVerificationChallenge.findMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      select: { id: true },
    });

    expect(tx.outboundEmailMessage.updateMany).toHaveBeenCalledWith({
      where: {
        aggregateType: 'EmailVerificationChallenge',
        aggregateId: { in: ['old-challenge-123'] },
        status: {
          in: ['PENDING', 'DISPATCHING', 'QUEUED', 'RETRY_SCHEDULED'],
        },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        encryptedPayload: null,
        lockedBy: null,
        lockedUntil: null,
        lastErrorCode: 'CHALLENGE_INELIGIBLE',
        updatedAt: now,
      },
    });

    expect(tx.emailVerificationChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    expect(tx.outboundEmailMessage.create).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'email-verification:new-challenge-123',
        lane: 'TRANSACTIONAL',
        templateKey: 'identity.email-verification',
        payloadVersion: 1,
        encryptedPayload,
        status: 'PENDING',
        availableAt: now,
        validUntil: expiresAt,
        aggregateType: 'EmailVerificationChallenge',
        aggregateId: 'new-challenge-123',
      },
    });

    expect(
      tx.outboundEmailMessage.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.emailVerificationChallenge.updateMany.mock.invocationCallOrder[0],
    );
    expect(
      tx.emailVerificationChallenge.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.emailVerificationChallenge.create.mock.invocationCallOrder[0],
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
