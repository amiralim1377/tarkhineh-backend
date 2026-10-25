import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import type { SecureTokenFactory } from '../../../../../shared/application/ports/secure-token-factory.port.js';

import type { PasswordHasher } from '../../ports/password-hasher.port.js';
import type { PasswordResetCompletionStore } from '../../ports/password-reset-completion-store.port.js';

import { PasswordPolicy } from '../../../domain/services/password-policy.js';
import {
  PasswordRequiredError,
  PasswordPolicyViolationError,
} from '../../errors/password-policy.error.js';
import { PasswordResetInvalidError } from '../../errors/password-reset.error.js';

import { ResetPasswordCommand } from './reset-password.command.js';
import { ResetPasswordHandler } from './reset-password.handler.js';

const FIXED_NOW = new Date('2026-10-25T10:00:00.000Z');

function createSut() {
  const now = vi.fn(() => new Date(FIXED_NOW.getTime()));
  const hashToken = vi.fn();
  const hashPassword = vi.fn();
  const completePasswordReset = vi.fn();
  const isValid = vi.fn();

  const clock = { now } as Clock;

  const tokenFactory = {
    create: vi.fn(),
    hash: hashToken,
  } as unknown as SecureTokenFactory;

  const passwordHasher = {
    hash: hashPassword,
  } as unknown as PasswordHasher;

  const passwordResetStore = {
    completePasswordReset,
  } as unknown as PasswordResetCompletionStore;

  const passwordPolicy = {
    isValid,
  } as unknown as PasswordPolicy;

  const handler = new ResetPasswordHandler(
    clock,
    tokenFactory,
    passwordHasher,
    passwordResetStore,
    passwordPolicy,
  );

  return {
    handler,
    now,
    hashToken,
    hashPassword,
    completePasswordReset,
    isValid,
  };
}

describe('ResetPasswordHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();

    sut.hashToken.mockReturnValue('hashed-token');
    sut.hashPassword.mockResolvedValue('hashed-password');
    sut.completePasswordReset.mockResolvedValue(true);
    sut.isValid.mockReturnValue(true);
  });

  describe('successful password reset', () => {
    it('should reset password successfully', async () => {
      const command = new ResetPasswordCommand(
        'raw-recovery-token',
        'ValidPassword123',
      );

      const result = await sut.handler.execute(command);

      expect(result).toEqual({
        message: 'Your password has been reset successfully.',
      });

      expect(sut.now).toHaveBeenCalledTimes(1);

      expect(sut.hashToken).toHaveBeenCalledWith('raw-recovery-token');

      expect(sut.isValid).toHaveBeenCalledWith('ValidPassword123');

      expect(sut.hashPassword).toHaveBeenCalledWith('ValidPassword123');

      expect(sut.completePasswordReset).toHaveBeenCalledTimes(1);

      expect(sut.completePasswordReset).toHaveBeenCalledWith({
        now: FIXED_NOW,
        tokenHash: 'hashed-token',
        passwordHash: 'hashed-password',
      });
    });
  });

  describe('input validation', () => {
    it('rejects an empty recovery token', async () => {
      const command = new ResetPasswordCommand('', 'ValidPassword123');

      await expect(sut.handler.execute(command)).rejects.toBeInstanceOf(
        PasswordResetInvalidError,
      );

      expect(sut.hashToken).not.toHaveBeenCalled();
      expect(sut.hashPassword).not.toHaveBeenCalled();
      expect(sut.completePasswordReset).not.toHaveBeenCalled();
    });

    it('rejects an empty new password', async () => {
      const command = new ResetPasswordCommand('valid-token', '');

      await expect(sut.handler.execute(command)).rejects.toBeInstanceOf(
        PasswordRequiredError,
      );

      expect(sut.hashToken).not.toHaveBeenCalled();
      expect(sut.hashPassword).not.toHaveBeenCalled();
      expect(sut.completePasswordReset).not.toHaveBeenCalled();
    });

    it('rejects a password that violates the password policy', async () => {
      const notAcceptablePassword = 'abcd';

      sut.isValid.mockReturnValue(false);
      const command = new ResetPasswordCommand(
        'valid-token',
        notAcceptablePassword,
      );

      await expect(sut.handler.execute(command)).rejects.toBeInstanceOf(
        PasswordPolicyViolationError,
      );

      expect(sut.isValid).toHaveBeenCalledTimes(1);
      expect(sut.isValid).toHaveBeenCalledWith(notAcceptablePassword);
      expect(sut.hashPassword).not.toHaveBeenCalled();
      expect(sut.completePasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('password reset store result', () => {
    it('throws PasswordResetInvalidError when the store returns false', async () => {
      // arrange
      const command = new ResetPasswordCommand(
        'valid-token',
        'ValidPassword123',
      );
      sut.completePasswordReset.mockResolvedValue(false);

      // Act & Assert
      await expect(sut.handler.execute(command)).rejects.toBeInstanceOf(
        PasswordResetInvalidError,
      );

      // assert
      expect(sut.completePasswordReset).toHaveBeenCalledTimes(1);
      expect(sut.completePasswordReset).toHaveBeenCalledWith({
        now: FIXED_NOW,
        tokenHash: 'hashed-token',
        passwordHash: 'hashed-password',
      });
    });

    it('does not call the store when password hashing fails', async () => {
      // arrange
      const command = new ResetPasswordCommand(
        'valid-token',
        'ValidPassword123',
      );

      sut.hashPassword.mockRejectedValue(new Error('Hashing failed'));

      // Act & Assert
      await expect(sut.handler.execute(command)).rejects.toThrow(
        'Hashing failed',
      );

      expect(sut.completePasswordReset).toHaveBeenCalledTimes(0);
      expect(sut.completePasswordReset).not.toHaveBeenCalled();
    });

    it('propagates an error when the store operation fails', async () => {
      // Arrange
      const command = new ResetPasswordCommand(
        'valid-token',
        'ValidPassword123',
      );

      sut.completePasswordReset.mockRejectedValue(
        new Error('Database unavailable'),
      );
      // Act & Assert
      await expect(sut.handler.execute(command)).rejects.toThrow(
        'Database unavailable',
      );

      expect(sut.completePasswordReset).toHaveBeenCalledTimes(1);
    });
  });
});
