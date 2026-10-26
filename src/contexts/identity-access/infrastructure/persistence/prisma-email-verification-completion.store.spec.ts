import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { EmailVerificationCompletionInput } from '../../application/ports/email-verification-completion-store.port.js';

import { PrismaEmailVerificationCompletionStore } from './prisma-email-verification-completion.store.js';

const { normalizePrismaErrorMock } = vi.hoisted(() => ({
  normalizePrismaErrorMock: vi.fn((error: unknown) => error),
}));

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError: normalizePrismaErrorMock,
}));

const FIXED_NOW = new Date('2026-10-26T10:00:00.000Z');

const PENDING_USER = {
  id: 'user-123',
  email: 'user@example.com',
  emailVerifiedAt: null,
  passwordHash: null,
  displayName: 'Test User',
  status: 'PENDING' as const,
};

const ACTIVE_USER = {
  ...PENDING_USER,
  emailVerifiedAt: new Date('2026-10-20T10:00:00.000Z'),
  status: 'ACTIVE' as const,
};

const VALID_INPUT: EmailVerificationCompletionInput = {
  tokenHash: 'a'.repeat(64),
  now: FIXED_NOW,
};

const CANDIDATE = {
  id: 'challenge-123',
  userId: PENDING_USER.id,
};

const VALID_CHALLENGE = {
  id: CANDIDATE.id,
  userId: PENDING_USER.id,
  email: PENDING_USER.email,
  expiresAt: new Date('2026-10-26T11:00:00.000Z'),
  consumedAt: null,
};

const WELCOME_MESSAGE_DATA = {
  idempotencyKey: `welcome:user:${PENDING_USER.id}`,
  lane: 'TRANSACTIONAL',
  templateKey: 'identity.welcome',
  payloadVersion: 1,
  encryptedPayload: 'encrypted-welcome-payload',
  status: 'PENDING',
  availableAt: FIXED_NOW,
  aggregateType: 'User',
  aggregateId: PENDING_USER.id,
};

function createHarness() {
  const payloadEncryptor = {
    encrypt: vi.fn((_plaintext: string) => 'encrypted-welcome-payload'),
    decrypt: vi.fn((ciphertext: string) => ciphertext),
  };

  const tx = {
    emailVerificationChallenge: {
      findUnique: vi.fn().mockResolvedValue(CANDIDATE),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },

    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },

    outboundEmailMessage: {
      create: vi.fn().mockResolvedValue({
        id: 'welcome-email-123',
      }),
    },

    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([PENDING_USER])
      .mockResolvedValueOnce([VALID_CHALLENGE]),
  };

  const transaction = vi.fn(
    async (operation: (transactionClient: typeof tx) => Promise<unknown>) =>
      operation(tx),
  );

  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  const store = new PrismaEmailVerificationCompletionStore(
    prisma,
    payloadEncryptor,
  );

  return {
    store,
    tx,
    transaction,
    payloadEncryptor,
  };
}

describe('PrismaEmailVerificationCompletionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizePrismaErrorMock.mockReset();
    normalizePrismaErrorMock.mockImplementation((error: unknown) => error);
  });

  describe('successful email verification', () => {
    it('verifies the email, consumes the challenge, and creates the welcome notification in one transaction', async () => {
      const sut = createHarness();

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(true);
      expect(sut.transaction).toHaveBeenCalledOnce();

      expect(sut.tx.emailVerificationChallenge.findUnique).toHaveBeenCalledWith(
        {
          where: {
            tokenHash: VALID_INPUT.tokenHash,
          },
          select: {
            id: true,
            userId: true,
          },
        },
      );

      expect(sut.tx.$queryRaw).toHaveBeenCalledTimes(2);

      expect(sut.tx.emailVerificationChallenge.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: CANDIDATE.id,
            userId: PENDING_USER.id,
            tokenHash: VALID_INPUT.tokenHash,
            consumedAt: null,
            expiresAt: {
              gt: VALID_INPUT.now,
            },
          },
          data: {
            consumedAt: VALID_INPUT.now,
          },
        },
      );

      expect(sut.tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: PENDING_USER.id,
          status: 'PENDING',
          emailVerifiedAt: null,
          email: PENDING_USER.email,
        },
        data: {
          status: 'ACTIVE',
          emailVerifiedAt: VALID_INPUT.now,
        },
      });

      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledOnce();
      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          email: PENDING_USER.email,
        }),
      );

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledWith({
        data: WELCOME_MESSAGE_DATA,
      });

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledOnce();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });

    it('locks the user before the challenge and performs writes before creating the notification', async () => {
      const sut = createHarness();

      await sut.store.completeEmailVerification(VALID_INPUT);

      expect(sut.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        sut.tx.$queryRaw.mock.invocationCallOrder[1],
      );

      expect(sut.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
        sut.tx.emailVerificationChallenge.updateMany.mock
          .invocationCallOrder[0],
      );

      expect(
        sut.tx.emailVerificationChallenge.updateMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(sut.tx.user.updateMany.mock.invocationCallOrder[0]);

      expect(sut.tx.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        sut.tx.outboundEmailMessage.create.mock.invocationCallOrder[0],
      );
    });
  });

  describe('input validation', () => {
    it('rejects an empty token hash before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.completeEmailVerification({
          ...VALID_INPUT,
          tokenHash: '',
        }),
      ).rejects.toThrow('Email verification token hash must not be empty.');

      expect(sut.transaction).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only token hash before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.completeEmailVerification({
          ...VALID_INPUT,
          tokenHash: '   ',
        }),
      ).rejects.toThrow('Email verification token hash must not be empty.');

      expect(sut.transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid timestamp before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.completeEmailVerification({
          ...VALID_INPUT,
          now: new Date('invalid'),
        }),
      ).rejects.toThrow('Email verification timestamp is invalid.');

      expect(sut.transaction).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });
  });

  describe('challenge and user validation', () => {
    it('returns false when the challenge does not exist', async () => {
      const sut = createHarness();

      sut.tx.emailVerificationChallenge.findUnique.mockResolvedValueOnce(null);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.transaction).toHaveBeenCalledOnce();
      expect(sut.tx.$queryRaw).not.toHaveBeenCalled();

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user does not exist', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockReset().mockResolvedValueOnce([]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledOnce();

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user has no email address', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockReset().mockResolvedValueOnce([
        {
          ...PENDING_USER,
          email: null,
        },
      ]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledOnce();

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the locked challenge does not exist', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([PENDING_USER])
        .mockResolvedValueOnce([]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledTimes(2);

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge belongs to another user', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([PENDING_USER])
        .mockResolvedValueOnce([
          {
            ...VALID_CHALLENGE,
            userId: 'different-user',
          },
        ]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge email differs from the current user email', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([PENDING_USER])
        .mockResolvedValueOnce([
          {
            ...VALID_CHALLENGE,
            email: 'different@example.com',
          },
        ]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge has expired', async () => {
      const sut = createHarness();

      const expiredChallenge = {
        ...VALID_CHALLENGE,
        expiresAt: new Date(FIXED_NOW.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([PENDING_USER])
        .mockResolvedValueOnce([expiredChallenge]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge has already been consumed', async () => {
      const sut = createHarness();

      const consumedChallenge = {
        ...VALID_CHALLENGE,
        consumedAt: new Date(FIXED_NOW.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([PENDING_USER])
        .mockResolvedValueOnce([consumedChallenge]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user email was already verified', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([ACTIVE_USER])
        .mockResolvedValueOnce([
          {
            ...VALID_CHALLENGE,
            email: ACTIVE_USER.email,
          },
        ]);

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).not.toHaveBeenCalled();
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('conditional updates', () => {
    it('returns false when challenge consumption affects no rows', async () => {
      const sut = createHarness();

      sut.tx.emailVerificationChallenge.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);
      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).toHaveBeenCalledOnce();

      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when account activation affects no rows', async () => {
      const sut = createHarness();

      sut.tx.user.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      const result = await sut.store.completeEmailVerification(VALID_INPUT);

      expect(result).toBe(false);

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).toHaveBeenCalledOnce();
      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();

      // The store throws inside the transaction to force rollback,
      // then converts the specific concurrency error to false.
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();

      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });
  });

  describe('transaction failures', () => {
    it('normalizes and rethrows an error when challenge consumption fails', async () => {
      const sut = createHarness();

      const databaseError = new Error('Challenge update failed');
      const normalizedError = new Error('Normalized persistence failure');

      sut.tx.emailVerificationChallenge.updateMany.mockRejectedValueOnce(
        databaseError,
      );

      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.completeEmailVerification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('normalizes and rethrows an error when account activation fails', async () => {
      const sut = createHarness();

      const databaseError = new Error('Account activation failed');
      const normalizedError = new Error('Normalized activation failure');

      sut.tx.user.updateMany.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.completeEmailVerification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).toHaveBeenCalledOnce();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('normalizes and rethrows an error when payload encryption fails', async () => {
      const sut = createHarness();

      const encryptionError = new Error('Payload encryption failed');
      const normalizedError = new Error('Normalized encryption failure');

      sut.payloadEncryptor.encrypt.mockImplementationOnce(() => {
        throw encryptionError;
      });

      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.completeEmailVerification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).toHaveBeenCalledOnce();
      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(encryptionError);
    });

    it('normalizes and rethrows an error when the welcome email insert fails', async () => {
      const sut = createHarness();

      const databaseError = new Error('Welcome email insert failed');
      const normalizedError = new Error('Normalized outbox failure');

      sut.tx.outboundEmailMessage.create.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.completeEmailVerification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(
        sut.tx.emailVerificationChallenge.updateMany,
      ).toHaveBeenCalledOnce();
      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();
      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledOnce();

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('normalizes and rethrows an error when the transaction itself fails', async () => {
      const sut = createHarness();

      const databaseError = new Error('Transaction failed');
      const normalizedError = new Error('Normalized transaction failure');

      sut.transaction.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.completeEmailVerification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });
  });
});
