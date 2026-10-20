import { beforeEach, describe, expect, it, vi } from 'vitest';

const { normalizePrismaErrorMock } = vi.hoisted(() => ({
  normalizePrismaErrorMock: vi.fn((error: unknown) => error),
}));

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError: normalizePrismaErrorMock,
}));

import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { CreatePasswordResetRequestInput } from '../../application/ports/password-reset-request-store.port.js';
import { PrismaPasswordResetRequestStore } from './prisma-password-reset-request.store.js';

interface UserRowFixture {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

const eligibleUser: UserRowFixture = {
  id: 'user-1',
  email: 'user@example.com',
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  passwordHash: 'existing-password-hash',
  displayName: 'Test User',
  status: 'ACTIVE',
};

const now = new Date('2026-10-20T12:00:00.000Z');

const validInput: CreatePasswordResetRequestInput = {
  email: 'user@example.com',
  tokenHash: 'a'.repeat(64),
  expiresAt: new Date('2026-10-20T13:00:00.000Z'),
  now,
  encryptedPayload: 'v1:encrypted-test-payload',
};

function createHarness() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([eligibleUser]),

    passwordResetChallenge: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'challenge-new' }),
    },

    outboundEmailMessage: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'outbox-new' }),
    },
  };

  const transaction = vi.fn(
    async (operation: (transactionClient: typeof tx) => Promise<unknown>) =>
      operation(tx),
  );

  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  return {
    store: new PrismaPasswordResetRequestStore(prisma),
    tx,
    transaction,
  };
}

describe('PrismaPasswordResetRequestStore', () => {
  beforeEach(() => {
    normalizePrismaErrorMock.mockReset();
    normalizePrismaErrorMock.mockImplementation((error: unknown) => error);
  });

  it('creates a password reset challenge and its outbox message in one transaction', async () => {
    const { store, tx, transaction } = createHarness();

    await store.createPasswordResetRequest(validInput);

    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();

    expect(tx.passwordResetChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: eligibleUser.id,
        email: eligibleUser.email,
        tokenHash: validInput.tokenHash,
        expiresAt: validInput.expiresAt,
      },
      select: { id: true },
    });

    expect(tx.outboundEmailMessage.create).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'password-reset:challenge-new',
        lane: 'TRANSACTIONAL',
        templateKey: 'identity.password-reset',
        payloadVersion: 1,
        encryptedPayload: validInput.encryptedPayload,
        status: 'PENDING',
        availableAt: validInput.now,
        validUntil: validInput.expiresAt,
        aggregateType: 'PasswordResetChallenge',
        aggregateId: 'challenge-new',
      },
    });
  });

  it('does not create a challenge or email when the user does not exist', async () => {
    const { store, tx } = createHarness();
    tx.$queryRaw.mockResolvedValue([]);

    await store.createPasswordResetRequest(validInput);

    expect(tx.passwordResetChallenge.findMany).not.toHaveBeenCalled();
    expect(tx.passwordResetChallenge.create).not.toHaveBeenCalled();
    expect(tx.outboundEmailMessage.create).not.toHaveBeenCalled();
  });

  it('does not create a challenge or email for an ineligible user', async () => {
    const { store, tx } = createHarness();

    tx.$queryRaw.mockResolvedValue([{ ...eligibleUser, status: 'SUSPENDED' }]);

    await store.createPasswordResetRequest(validInput);

    expect(tx.passwordResetChallenge.findMany).not.toHaveBeenCalled();
    expect(tx.passwordResetChallenge.create).not.toHaveBeenCalled();
    expect(tx.outboundEmailMessage.create).not.toHaveBeenCalled();
  });

  it('invalidates previous challenges and handles their pending email messages', async () => {
    const { store, tx } = createHarness();

    tx.passwordResetChallenge.findMany.mockResolvedValue([
      { id: 'challenge-old-1' },
      { id: 'challenge-old-2' },
    ]);

    await store.createPasswordResetRequest(validInput);

    expect(tx.passwordResetChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['challenge-old-1', 'challenge-old-2'] },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: validInput.now,
      },
    });

    expect(tx.outboundEmailMessage.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        aggregateType: 'PasswordResetChallenge',
        aggregateId: {
          in: ['challenge-old-1', 'challenge-old-2'],
        },
        status: {
          in: ['PENDING', 'DISPATCHING', 'QUEUED', 'RETRY_SCHEDULED'],
        },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: validInput.now,
        encryptedPayload: null,
        lockedBy: null,
        lockedUntil: null,
        lastErrorCode: 'CHALLENGE_SUPERSEDED',
      },
    });

    expect(tx.outboundEmailMessage.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        aggregateType: 'PasswordResetChallenge',
        aggregateId: {
          in: ['challenge-old-1', 'challenge-old-2'],
        },
        status: 'OUTCOME_UNKNOWN',
      },
      data: {
        encryptedPayload: null,
      },
    });

    expect(tx.passwordResetChallenge.create).toHaveBeenCalledOnce();
    expect(tx.outboundEmailMessage.create).toHaveBeenCalledOnce();
  });

  it('rejects an invalid token hash before opening a transaction', async () => {
    const { store, transaction } = createHarness();

    await expect(
      store.createPasswordResetRequest({
        ...validInput,
        tokenHash: 'invalid-hash',
      }),
    ).rejects.toThrow('Password reset token hash is invalid.');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an expiration time that is not after the current time', async () => {
    const { store, transaction } = createHarness();

    await expect(
      store.createPasswordResetRequest({
        ...validInput,
        expiresAt: validInput.now,
      }),
    ).rejects.toThrow('Password reset expiration dates are invalid.');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('normalizes and rethrows database transaction errors', async () => {
    const { store, transaction } = createHarness();
    const databaseError = new Error('Database failure');
    const normalizedError = new Error('Normalized persistence failure');

    transaction.mockRejectedValueOnce(databaseError);
    normalizePrismaErrorMock.mockReturnValue(normalizedError);

    await expect(store.createPasswordResetRequest(validInput)).rejects.toBe(
      normalizedError,
    );

    expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
  });
});
