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

function createHarness() {
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
    store: new PrismaPasswordResetCompletionStore(prisma),
    tx,
    transaction,
  };
}

describe('PrismaPasswordResetCompletionStore', () => {
  beforeEach(() => {
    normalizePrismaErrorMock.mockReset();
    normalizePrismaErrorMock.mockImplementation((error: unknown) => error);
  });

  it('updates the password, consumes the challenge, and revokes sessions in one transaction', async () => {
    // Arrange
    const sut = createHarness();
    // Act
    const result = await sut.store.completePasswordReset(validInput);
    // Assert

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

    expect(sut.tx.authSession.updateMany).toHaveBeenCalledOnce();
    expect(sut.tx.refreshToken.updateMany).toHaveBeenCalledOnce();

    expect(sut.tx.outboundEmailMessage.updateMany).toHaveBeenCalledTimes(2);
  });

  it('returns false when the password reset challenge does not exist', async () => {
    // arrange
    const sut = createHarness();

    sut.tx.passwordResetChallenge.findUnique.mockResolvedValueOnce(null);

    // act
    const result = await sut.store.completePasswordReset(validInput);

    // assert

    expect(result).toBe(false);
    expect(sut.transaction).toHaveBeenCalledOnce();

    expect(sut.tx.$queryRaw).not.toHaveBeenCalled();
    expect(sut.tx.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
    expect(sut.tx.user.update).not.toHaveBeenCalled();
    expect(sut.tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(sut.tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  describe('input validation', () => {
    it('rejects an invalid token hash before opening a transaction', async () => {
      // Arrange
      const sut = createHarness();
      const input = { ...validInput, tokenHash: 'invalid-hash' };

      // Act
      // TODO: Call completePasswordReset with input.

      // Assert
      // TODO: Expect the correct TypeError.
      // TODO: Expect the transaction not to be called.
    });

    it('rejects an empty password hash before opening a transaction', async () => {
      // Arrange
      const sut = createHarness();
      const input = { ...validInput, passwordHash: '   ' };

      // Act
      // TODO: Call completePasswordReset with input.

      // Assert
      // TODO: Expect the correct TypeError.
      // TODO: Expect the transaction not to be called.
    });

    it('rejects an invalid date before opening a transaction', async () => {
      // Arrange
      const sut = createHarness();
      const input = { ...validInput, now: new Date('invalid') };

      // Act
      // TODO: Call completePasswordReset with input.

      // Assert
      // TODO: Expect the correct RangeError.
      // TODO: Expect the transaction not to be called.
    });
  });

  describe('challenge validation', () => {
    it('returns false when the challenge does not exist', async () => {
      // Arrange
      const sut = createHarness();
      sut.tx.passwordResetChallenge.findUnique.mockResolvedValueOnce(null);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify that no user query or database update occurred.
    });

    it('returns false when the user does not exist', async () => {
      // Arrange
      const sut = createHarness();

      sut.tx.$queryRaw.mockReset().mockResolvedValueOnce([]);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify no Challenge update, password update, or session revocation.
    });

    it('returns false when the user is not eligible for password login', async () => {
      // Arrange
      const sut = createHarness();

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([{ ...eligibleUser, status: 'SUSPENDED' }]);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify the Challenge was not locked or consumed.
      // TODO: Verify the password and sessions were not changed.
    });

    it('returns false when the challenge has expired', async () => {
      // Arrange
      const sut = createHarness();

      const expiredChallenge = {
        ...validChallenge,
        expiresAt: new Date(now.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([expiredChallenge]);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify no Challenge consumption or password update.
    });

    it('returns false when the challenge has already been consumed', async () => {
      // Arrange
      const sut = createHarness();

      const consumedChallenge = {
        ...validChallenge,
        consumedAt: new Date(now.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([consumedChallenge]);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify no password or session updates occurred.
    });

    it('returns false when the challenge has been invalidated', async () => {
      // Arrange
      const sut = createHarness();

      const invalidatedChallenge = {
        ...validChallenge,
        invalidatedAt: new Date(now.getTime() - 1000),
      };

      sut.tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([eligibleUser])
        .mockResolvedValueOnce([invalidatedChallenge]);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify no password or session updates occurred.
    });

    it('returns false when conditional challenge consumption affects no rows', async () => {
      // Arrange
      const sut = createHarness();

      sut.tx.passwordResetChallenge.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be false.
      // TODO: Verify the password and sessions were not updated.
    });
  });

  describe('transaction failures', () => {
    it('propagates an error when updating the password fails', async () => {
      // Arrange
      const sut = createHarness();
      const databaseError = new Error('Password update failed');

      sut.tx.user.update.mockRejectedValueOnce(databaseError);

      // Act & Assert
      // TODO: Expect completePasswordReset to reject with databaseError.
      // TODO: Verify the password update was attempted.
      // TODO: Verify session revocation did not continue.
    });

    it('normalizes and rethrows transaction errors', async () => {
      // Arrange
      const sut = createHarness();
      const databaseError = new Error('Database failure');
      const normalizedError = new Error('Normalized persistence failure');

      sut.transaction.mockRejectedValueOnce(databaseError);
      normalizePrismaErrorMock.mockReturnValueOnce(normalizedError);

      // Act & Assert
      // TODO: Expect completePasswordReset to reject with normalizedError.
      // TODO: Verify normalizePrismaErrorMock received databaseError.
    });
  });

  describe('previous challenges and outbound emails', () => {
    it('invalidates previous challenges and handles their outbound messages', async () => {
      // Arrange
      const sut = createHarness();

      sut.tx.passwordResetChallenge.findMany.mockResolvedValueOnce([
        { id: 'challenge-old-1' },
        { id: 'challenge-old-2' },
      ]);

      // Act
      const result = await sut.store.completePasswordReset(validInput);

      // Assert
      // TODO: Expect result to be true.
      // TODO: Verify previous challenges were invalidated.
      // TODO: Verify pending messages were cancelled and their payloads cleared.
      // TODO: Verify OUTCOME_UNKNOWN messages had their payloads cleared.
      // TODO: Verify password update and session revocation occurred.
    });
  });
});
