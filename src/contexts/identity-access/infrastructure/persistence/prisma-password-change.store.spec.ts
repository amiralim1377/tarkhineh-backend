import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { PasswordChangeStoreInput } from '../../application/ports/password-change-store.port.js';
import { PrismaPasswordChangeStore } from './prisma-password-change.store.js';

const { normalizePrismaErrorMock } = vi.hoisted(() => ({
  normalizePrismaErrorMock: vi.fn((error: unknown) => error),
}));

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError: normalizePrismaErrorMock,
}));

const FIXED_NOW = new Date('2026-10-26T10:00:00.000Z');

const ACTIVE_USER = {
  id: 'user-123',
  email: 'user@example.com',
  emailVerifiedAt: new Date('2026-10-20T10:00:00.000Z'),
  passwordHash: 'current-password-hash',
  status: 'ACTIVE' as const,
};

const VALID_INPUT: PasswordChangeStoreInput = {
  userId: ACTIVE_USER.id,
  currentPasswordHash: ACTIVE_USER.passwordHash,
  newPasswordHash: 'new-password-hash',
  operationId: 'operation-123',
  now: FIXED_NOW,
};

function createHarness() {
  const payloadEncryptor = {
    encrypt: vi.fn((_plaintext: string) => 'encrypted-payload'),
    decrypt: vi.fn((ciphertext: string) => ciphertext),
  };

  const tx = {
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },

    authSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },

    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },

    outboundEmailMessage: {
      create: vi.fn().mockResolvedValue({
        id: 'outbound-email-123',
      }),
    },

    $queryRaw: vi.fn().mockResolvedValue([ACTIVE_USER]),
  };

  const transaction = vi.fn(
    async (operation: (transactionClient: typeof tx) => Promise<unknown>) =>
      operation(tx),
  );

  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  const store = new PrismaPasswordChangeStore(prisma, payloadEncryptor);

  return {
    store,
    tx,
    transaction,
    payloadEncryptor,
  };
}

describe('PrismaPasswordChangeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizePrismaErrorMock.mockReset();
    normalizePrismaErrorMock.mockImplementation((error: unknown) => error);
  });

  describe('successful password change', () => {
    it('changes the password, revokes sessions, and enqueues the notification in one transaction', async () => {
      const sut = createHarness();

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(true);
      expect(sut.transaction).toHaveBeenCalledOnce();
      expect(sut.tx.$queryRaw).toHaveBeenCalledOnce();

      expect(sut.tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: VALID_INPUT.userId,
          passwordHash: VALID_INPUT.currentPasswordHash,
          status: 'ACTIVE',
          emailVerifiedAt: {
            not: null,
          },
        },
        data: {
          passwordHash: VALID_INPUT.newPasswordHash,
        },
      });

      expect(sut.tx.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: VALID_INPUT.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: VALID_INPUT.now,
          revocationReason: 'SECURITY_ACTION',
        },
      });

      expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          revokedAt: null,
          session: {
            is: {
              userId: VALID_INPUT.userId,
            },
          },
        },
        data: {
          revokedAt: VALID_INPUT.now,
        },
      });

      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledOnce();
      expect(sut.payloadEncryptor.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          email: ACTIVE_USER.email,
        }),
      );

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledWith({
        data: {
          idempotencyKey: `password-changed:change:${VALID_INPUT.operationId}`,
          lane: 'TRANSACTIONAL',
          templateKey: 'identity.password-changed',
          payloadVersion: 1,
          encryptedPayload: 'encrypted-payload',
          status: 'PENDING',
          availableAt: VALID_INPUT.now,
          aggregateType: 'User',
          aggregateId: ACTIVE_USER.id,
        },
      });

      expect(sut.tx.outboundEmailMessage.create).toHaveBeenCalledOnce();
      expect(normalizePrismaErrorMock).not.toHaveBeenCalled();
    });

    it('locks and reads the user before attempting any update', async () => {
      const sut = createHarness();

      await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(sut.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        sut.tx.user.updateMany.mock.invocationCallOrder[0],
      );

      expect(sut.tx.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        sut.tx.authSession.updateMany.mock.invocationCallOrder[0],
      );

      expect(
        sut.tx.authSession.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        sut.tx.refreshToken.updateMany.mock.invocationCallOrder[0],
      );

      expect(
        sut.tx.refreshToken.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        sut.tx.outboundEmailMessage.create.mock.invocationCallOrder[0],
      );
    });
  });

  describe('input validation', () => {
    it('rejects an empty user ID before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.changePasswordAndEnqueueNotification({
          ...VALID_INPUT,
          userId: '   ',
        }),
      ).rejects.toThrow('Password change user ID must not be empty.');

      expect(sut.transaction).not.toHaveBeenCalled();
    });

    it('rejects an empty current password hash before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.changePasswordAndEnqueueNotification({
          ...VALID_INPUT,
          currentPasswordHash: '   ',
        }),
      ).rejects.toThrow('Current password hash must not be empty.');

      expect(sut.transaction).not.toHaveBeenCalled();
    });

    it('rejects an empty new password hash before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.changePasswordAndEnqueueNotification({
          ...VALID_INPUT,
          newPasswordHash: '   ',
        }),
      ).rejects.toThrow('New password hash must not be empty.');

      expect(sut.transaction).not.toHaveBeenCalled();
    });

    it('rejects an empty operation ID before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.changePasswordAndEnqueueNotification({
          ...VALID_INPUT,
          operationId: '   ',
        }),
      ).rejects.toThrow('Password change operation ID must not be empty.');

      expect(sut.transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid date before opening a transaction', async () => {
      const sut = createHarness();

      await expect(
        sut.store.changePasswordAndEnqueueNotification({
          ...VALID_INPUT,
          now: new Date('invalid'),
        }),
      ).rejects.toThrow('Password change timestamp is invalid.');

      expect(sut.transaction).not.toHaveBeenCalled();
    });
  });

  describe('user eligibility and concurrency', () => {
    it('returns false when the user does not exist', async () => {
      const sut = createHarness();
      sut.tx.$queryRaw.mockResolvedValueOnce([]);

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the stored password hash has changed', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockResolvedValueOnce([
        {
          ...ACTIVE_USER,
          passwordHash: 'different-password-hash',
        },
      ]);

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the account is not active', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockResolvedValueOnce([
        {
          ...ACTIVE_USER,
          status: 'SUSPENDED',
        },
      ]);

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the email has not been verified', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockResolvedValueOnce([
        {
          ...ACTIVE_USER,
          emailVerifiedAt: null,
        },
      ]);

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the user has no email address', async () => {
      const sut = createHarness();

      sut.tx.$queryRaw.mockResolvedValueOnce([
        {
          ...ACTIVE_USER,
          email: null,
        },
      ]);

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.user.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('returns false when the conditional password update affects no rows', async () => {
      const sut = createHarness();

      sut.tx.user.updateMany.mockResolvedValueOnce({ count: 0 });

      const result =
        await sut.store.changePasswordAndEnqueueNotification(VALID_INPUT);

      expect(result).toBe(false);
      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();

      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('transaction failures', () => {
    it('normalizes and rethrows an error when updating the password fails', async () => {
      const sut = createHarness();
      const databaseError = new Error('Password update failed');
      const normalizedError = new Error('Normalized persistence failure');

      sut.tx.user.updateMany.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.changePasswordAndEnqueueNotification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
      expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
    });

    it('stops when session revocation fails', async () => {
      const sut = createHarness();
      const databaseError = new Error('Session revocation failed');

      sut.tx.authSession.updateMany.mockRejectedValueOnce(databaseError);

      await expect(
        sut.store.changePasswordAndEnqueueNotification(VALID_INPUT),
      ).rejects.toBe(databaseError);

      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('stops when refresh-token revocation fails', async () => {
      const sut = createHarness();
      const databaseError = new Error('Refresh-token revocation failed');

      sut.tx.refreshToken.updateMany.mockRejectedValueOnce(databaseError);

      await expect(
        sut.store.changePasswordAndEnqueueNotification(VALID_INPUT),
      ).rejects.toBe(databaseError);

      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.authSession.updateMany).toHaveBeenCalledOnce();
      expect(sut.payloadEncryptor.encrypt).not.toHaveBeenCalled();
      expect(sut.tx.outboundEmailMessage.create).not.toHaveBeenCalled();
      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });

    it('normalizes and rethrows an error when the notification insert fails', async () => {
      const sut = createHarness();
      const databaseError = new Error('Notification insert failed');
      const normalizedError = new Error('Normalized notification failure');

      sut.tx.outboundEmailMessage.create.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      await expect(
        sut.store.changePasswordAndEnqueueNotification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(sut.tx.user.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.authSession.updateMany).toHaveBeenCalledOnce();
      expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledOnce();
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
        sut.store.changePasswordAndEnqueueNotification(VALID_INPUT),
      ).rejects.toBe(normalizedError);

      expect(normalizePrismaErrorMock).toHaveBeenCalledWith(databaseError);
    });
  });
});
