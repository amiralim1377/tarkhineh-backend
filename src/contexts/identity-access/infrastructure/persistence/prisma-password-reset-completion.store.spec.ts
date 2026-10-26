import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { PasswordResetCompletionStoreInput } from '../../application/ports/password-reset-completion-store.port.js';
import { PrismaPasswordResetCompletionStore } from './prisma-password-reset-completion.store.js';

const { normalizePrismaErrorMock } = vi.hoisted(() => ({
  normalizePrismaErrorMock: vi.fn((error: unknown) => error),
}));

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError: normalizePrismaErrorMock,
}));

const now = new Date('2026-10-25T10:00:00.000Z');

const eligibleUser = {
  id: 'user-1',
  email: 'user@example.com',
  emailVerifiedAt: new Date('2026-10-20T10:00:00.000Z'),
  passwordHash: 'old-password-hash',
  displayName: 'Test User',
  status: 'ACTIVE' as const,
};

const validInput: PasswordResetCompletionStoreInput = {
  tokenHash: 'a'.repeat(64),
  passwordHash: 'new-password-hash',
  now,
};

const candidate = {
  id: 'challenge-1',
  userId: eligibleUser.id,
};

const validChallenge = {
  id: candidate.id,
  userId: eligibleUser.id,
  expiresAt: new Date('2026-10-25T11:00:00.000Z'),
  consumedAt: null,
  invalidatedAt: null,
};

const cancellableStatuses = [
  'PENDING',
  'DISPATCHING',
  'QUEUED',
  'RETRY_SCHEDULED',
];

function createHarness() {
  const payloadEncryptor = {
    encrypt: vi.fn((_plaintext: string) => 'encrypted-payload'),
    decrypt: vi.fn((ciphertext: string) => ciphertext),
  };

  const tx = {
    passwordResetChallenge: {
      findUnique: vi.fn().mockResolvedValue(candidate),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },

    user: {
      update: vi.fn().mockResolvedValue({ id: eligibleUser.id }),
    },

    authSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },

    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },

    outboundEmailMessage: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'outbound-email-1' }),
    },

    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([eligibleUser])
      .mockResolvedValueOnce([validChallenge]),
  };

  const transaction = vi.fn(
    async (operation: (transactionClient: typeof tx) => Promise<unknown>) =>
      operation(tx),
  );

  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  return {
    store: new PrismaPasswordResetCompletionStore(prisma, payloadEncryptor),
    tx,
    transaction,
    payloadEncryptor,
  };
}

describe('PrismaPasswordResetCompletionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizePrismaErrorMock.mockReset();
    normalizePrismaErrorMock.mockImplementation((error: unknown) => error);
  });

  describe('successful password reset', () => {
    it('updates the password, consumes the challenge, revokes sessions, and creates the notification in one transaction', async () => {
      const sut = createHarness();

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(true);
      expect(sut.transaction).toHaveBeenCalledOnce();

      expect(sut.tx.passwordResetChallenge.findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: validInput.tokenHash,
        },
        select: {
          id: true,
          userId: true,
        },
      });

      expect(sut.tx.$queryRaw).toHaveBeenCalledTimes(2);

      expect(sut.tx.passwordResetChallenge.updateMany).toHaveBeenCalledWith({
        where: {
          id: candidate.id,
          userId: eligibleUser.id,
          tokenHash: validInput.tokenHash,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: {
            gt: validInput.now,
          },
        },
        data: {
          consumedAt: validInput.now,
        },
      });

      expect(sut.tx.user.update).toHaveBeenCalledWith({
        where: {
          id: eligibleUser.id,
        },
        data: {
          passwordHash: validInput.passwordHash,
        },
      });

      expect(sut.tx.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: eligibleUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: validInput.now,
          revocationReason: 'SECURITY_ACTION',
        },
      });

      expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          revokedAt: null,
          session: {
            is: {
              userId: eligibleUser.id,
            },
          },
        },
        data: {
          revokedAt: validInput.now,
        },
      });

      expect(sut.tx.authSession.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledOnce();

      // There are two cleanup queries when there are no other challenges:
      // pending delivery and unknown provider outcome for the consumed challenge.
      expect(sut.tx.outboundEmailMessage.updateMany).toHaveBeenCalledTimes(2);

      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          email: eligibleUser.email,
        }),
      );

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledWith({
        data: {
          idempotencyKey: `password-changed:reset:${candidate.id}`,
          lane: 'TRANSACTIONAL',
          templateKey: 'identity.password-changed',
          payloadVersion: 1,
          encryptedPayload: 'encrypted-payload',
          status: 'PENDING',
          availableAt: validInput.now,
          aggregateType: 'User',
          aggregateId: eligibleUser.id,
        },
      });

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledOnce();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects an invalid token hash before opening a transaction', async () => {
      const sut = createHarness();
      const input = {
        ...validInput,
        tokenHash: 'invalid-hash',
      };

      await expect(
        sut.store.completePasswordReset(input),
      ).rejects.toMatchObject({
        name: 'TypeError',
        message: 'Password reset token hash is invalid.',
      });

      expect(sut.transaction).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });

    it('rejects an empty password hash before opening a transaction', async () => {
      const sut = createHarness();
      const input = {
        ...validInput,
        passwordHash: '   ',
      };

      await expect(
        sut.store.completePasswordReset(input),
      ).rejects.toMatchObject({
        name: 'TypeError',
        message: 'Password reset password hash must not be empty.',
      });

      expect(sut.transaction).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid date before opening a transaction', async () => {
      const sut = createHarness();
      const input = {
        ...validInput,
        now: new Date('invalid'),
      };

      await expect(
        sut.store.completePasswordReset(input),
      ).rejects.toMatchObject({
        name: 'RangeError',
        message: 'Password reset timestamp is invalid.',
      });

      expect(sut.transaction).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });
  });

  describe('challenge and user validation', () => {
    it('returns false when the password reset challenge does not exist', async () => {
      const sut = createHarness();

      sut.tx.passwordResetChallenge.findUnique.mockResolvedValueOnce(null);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.transaction).toHaveBeenCalledOnce();

      expect(sut.tx.$queryRaw).not.toHaveBeenCalled();
      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user does not exist', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockReset().mockResolvedValueOnce([]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledOnce();

      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();

      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user is not eligible for password login', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockReset().mockResolvedValueOnce([
        {
          ...eligibleUser,
          status: 'SUSPENDED',
        },
      ]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledOnce();

      // The challenge must not be locked or consumed for an ineligible user.
      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user has no email address', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockReset().mockResolvedValueOnce([
        {
          ...eligibleUser,
          email: null,
        },
      ]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledOnce();

      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge no longer exists when re-read under lock', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.$queryRaw).toHaveBeenCalledTimes(2);

      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the locked challenge belongs to a different user', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([
          {
            ...validChallenge,
            userId: 'different-user',
          },
        ]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge has expired', async () => {
      const sut = createHarness();

      const expiredChallenge = {
        ...validChallenge,
        expiresAt: new Date(now.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([expiredChallenge]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge has already been consumed', async () => {
      const sut = createHarness();

      const consumedChallenge = {
        ...validChallenge,
        consumedAt: new Date(now.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([consumedChallenge]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the challenge has been invalidated', async () => {
      const sut = createHarness();

      const invalidatedChallenge = {
        ...validChallenge,
        invalidatedAt: new Date(now.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([invalidatedChallenge]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when conditional challenge consumption affects no rows', async () => {
      const sut = createHarness();

      sut.tx.passwordResetChallenge.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(false);
      expect(sut.tx.passwordResetChallenge.updateMany).toHaveBeenCalledOnce();

      expect(sut.tx.user.update).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('transaction failures', () => {
    it('normalizes and rethrows an error when updating the password fails', async () => {
      const sut = createHarness();
      const databaseError = new Error('Password update failed');

      sut.tx.user.update.mockRejectedValueOnce(databaseError);

      await expect(sut.store.completePasswordReset(validInput)).rejects.toBe(
        databaseError,
      );

      expect(sut.tx.user.update).toHaveBeenCalledOnce();

      // Session revocation and notification creation must not continue.
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('normalizes and rethrows transaction errors', async () => {
      const sut = createHarness();
      const databaseError = new Error('Database failure');
      const normalizedError = new Error('Normalized persistence failure');

      sut.transaction.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(sut.store.completePasswordReset(validInput)).rejects.toBe(
        normalizedError,
      );

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('normalizes and rethrows an error when creating the notification fails', async () => {
      const sut = createHarness();
      const notificationError = new Error('Notification insert failed');

      sut.tx.outboundEmailMessage.create.mockRejectedValueOnce(
        notificationError,
      );

      await expect(sut.store.completePasswordReset(validInput)).rejects.toBe(
        notificationError,
      );

      expect(sut.tx.user.update).toHaveBeenCalledOnce();
      expect(sut.tx.authSession.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledOnce();

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledOnce();
      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(notificationError);
    });
  });

  describe('previous challenges and outbound emails', () => {
    it('invalidates previous challenges and cancels their pending outbound messages', async () => {
      const sut = createHarness();

      const previousChallengeIds = ['challenge-old-1', 'challenge-old-2'];

      sut.tx.passwordResetChallenge.findMany.mockResolvedValueOnce([
        { id: previousChallengeIds[0] },
        { id: previousChallengeIds[1] },
      ]);

      const result = await sut.store.completePasswordReset(validInput);

      expect(result).toBe(true);

      expect(sut.tx.passwordResetChallenge.findMany).toHaveBeenCalledWith({
        where: {
          userId: eligibleUser.id,
          id: {
            not: candidate.id,
          },
          consumedAt: null,
          invalidatedAt: null,
        },
        select: {
          id: true,
        },
      });

      expect(sut.tx.passwordResetChallenge.updateMany).toHaveBeenNthCalledWith(
        2,
        {
          where: {
            id: {
              in: previousChallengeIds,
            },
            consumedAt: null,
            invalidatedAt: null,
          },
          data: {
            invalidatedAt: validInput.now,
          },
        },
      );

      expect(sut.tx.outboundEmailMessage.updateMany).toHaveBeenNthCalledWith(
        1,
        {
          where: {
            aggregateType: 'PasswordResetChallenge',
            aggregateId: {
              in: previousChallengeIds,
            },
            status: {
              in: cancellableStatuses,
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
        },
      );

      expect(sut.tx.outboundEmailMessage.updateMany).toHaveBeenNthCalledWith(
        2,
        {
          where: {
            aggregateType: 'PasswordResetChallenge',
            aggregateId: {
              in: previousChallengeIds,
            },
            status: 'OUTCOME_UNKNOWN',
          },
          data: {
            encryptedPayload: null,
          },
        },
      );

      // Two additional cleanup queries apply to the consumed challenge.
      expect(sut.tx.outboundEmailMessage.updateMany).toHaveBeenCalledTimes(4);

      expect(sut.tx.user.update).toHaveBeenCalledOnce();
      expect(sut.tx.authSession.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledOnce();

      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ email: eligibleUser.email }),
      );
      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledOnce();
    });
  });
});
