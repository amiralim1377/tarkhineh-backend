import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityUser } from '../../../domain/entities/identity-user.js';
import type { UserAuthenticationRepository } from '../../../domain/ports/user-authentication.repository.js';
import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import type { PasswordHasher } from '../../ports/password-hasher.port.js';
import type { PasswordVerifier } from '../../ports/password-verifier.port.js';
import type { PasswordChangeStore } from '../../ports/password-change-store.port.js';

import { ChangePasswordCommand } from './change-password.command.js';
import { ChangePasswordHandler } from './change-password.handler.js';

import {
  ChangePasswordCredentialsError,
  PasswordUnchangedError,
} from '../../errors/change-password.errors.js';

const FIXED_NOW = new Date('2026-10-19T10:00:00.000Z');

function createActiveUser(): IdentityUser {
  return IdentityUser.provisionVerified({
    id: 'user-123',
    email: 'user@example.com',
    emailVerifiedAt: new Date('2026-10-18T12:00:00.000Z'),
    passwordHash: 'current-password-hash',
    displayName: 'Test User',
  });
}

function createSut() {
  const user = createActiveUser();

  const findById = vi.fn();
  const verify = vi.fn();
  const hash = vi.fn();

  const changePasswordAndEnqueueNotification = vi.fn();

  const now = vi.fn(() => new Date(FIXED_NOW.getTime()));

  const users = {
    findById,
    findByEmail: vi.fn(),
  } as unknown as UserAuthenticationRepository;

  const passwordVerifier = {
    verify,
  } as PasswordVerifier;

  const passwordHasher = {
    hash,
  } as PasswordHasher;

  const passwordChangeStore = {
    changePasswordAndEnqueueNotification,
  } as unknown as PasswordChangeStore;

  const clock = { now } as Clock;

  const handler = new ChangePasswordHandler(
    users,
    passwordVerifier,
    passwordHasher,
    passwordChangeStore,
    clock,
  );

  return {
    handler,
    user,
    findById,
    verify,
    hash,
    changePasswordAndEnqueueNotification,
    now,
  };
}

describe('ChangePasswordHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();

    sut.findById.mockResolvedValue(sut.user);

    sut.verify.mockImplementation(
      async (_passwordHash: string, plainPassword: string) =>
        plainPassword === 'CurrentPassword123!',
    );

    sut.hash.mockResolvedValue('new-password-hash');

    sut.changePasswordAndEnqueueNotification.mockResolvedValue(true);
  });

  describe('successful password change', () => {
    it('verifies credentials, hashes the new password, and delegates the atomic operation', async () => {
      const result = await sut.handler.execute(
        new ChangePasswordCommand(
          'user-123',
          'CurrentPassword123!',
          'NewPassword456!',
        ),
      );

      expect(result).toEqual({
        message: 'Password changed successfully.',
      });

      expect(sut.findById).toHaveBeenCalledOnce();
      expect(sut.findById).toHaveBeenCalledWith('user-123');

      expect(sut.verify).toHaveBeenCalledTimes(2);

      expect(sut.verify).toHaveBeenNthCalledWith(
        1,
        'current-password-hash',
        'CurrentPassword123!',
      );

      expect(sut.verify).toHaveBeenNthCalledWith(
        2,
        'current-password-hash',
        'NewPassword456!',
      );

      expect(sut.hash).toHaveBeenCalledOnce();
      expect(sut.hash).toHaveBeenCalledWith('NewPassword456!');

      expect(sut.changePasswordAndEnqueueNotification).toHaveBeenCalledOnce();

      expect(sut.changePasswordAndEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          currentPasswordHash: 'current-password-hash',
          newPasswordHash: 'new-password-hash',
          operationId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
          now: FIXED_NOW,
        }),
      );

      expect(sut.now).toHaveBeenCalledOnce();
    });

    it('does not pass plaintext passwords to the store', async () => {
      await sut.handler.execute(
        new ChangePasswordCommand(
          'user-123',
          'CurrentPassword123!',
          'NewPassword456!',
        ),
      );

      expect(sut.changePasswordAndEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPasswordHash: 'current-password-hash',
          newPasswordHash: 'new-password-hash',
        }),
      );

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({
          newPasswordHash: 'NewPassword456!',
        }),
      );

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({
          currentPasswordHash: 'CurrentPassword123!',
        }),
      );
    });
  });

  describe('credential validation', () => {
    it('rejects when the user does not exist', async () => {
      sut.findById.mockResolvedValue(null);

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'missing-user',
            'CurrentPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toBeInstanceOf(ChangePasswordCredentialsError);

      expect(sut.verify).not.toHaveBeenCalled();
      expect(sut.hash).not.toHaveBeenCalled();

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalled();
    });

    it('rejects when the account cannot log in with a password', async () => {
      vi.spyOn(sut.user, 'canLoginWithPassword').mockReturnValue(false);

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'CurrentPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toBeInstanceOf(ChangePasswordCredentialsError);

      expect(sut.verify).not.toHaveBeenCalled();
      expect(sut.hash).not.toHaveBeenCalled();

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalled();
    });

    it('rejects when the user has no password hash', async () => {
      vi.spyOn(sut.user, 'passwordHash', 'get').mockReturnValue(null);

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'CurrentPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toBeInstanceOf(ChangePasswordCredentialsError);

      expect(sut.verify).not.toHaveBeenCalled();
      expect(sut.hash).not.toHaveBeenCalled();

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalled();
    });

    it('rejects when the current password is incorrect', async () => {
      sut.verify.mockResolvedValueOnce(false);

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'WrongPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toBeInstanceOf(ChangePasswordCredentialsError);

      expect(sut.verify).toHaveBeenCalledOnce();
      expect(sut.hash).not.toHaveBeenCalled();

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalled();
    });

    it('rejects when the new password matches the current password', async () => {
      sut.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'CurrentPassword123!',
            'CurrentPassword123!',
          ),
        ),
      ).rejects.toBeInstanceOf(PasswordUnchangedError);

      expect(sut.verify).toHaveBeenCalledTimes(2);
      expect(sut.hash).not.toHaveBeenCalled();

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('rejects when the atomic store operation returns false', async () => {
      sut.changePasswordAndEnqueueNotification.mockResolvedValue(false);

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'CurrentPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toBeInstanceOf(ChangePasswordCredentialsError);

      expect(sut.hash).toHaveBeenCalledWith('NewPassword456!');

      expect(sut.changePasswordAndEnqueueNotification).toHaveBeenCalledOnce();
    });

    it('does not invoke the store when password hashing fails', async () => {
      sut.hash.mockRejectedValue(new Error('Hashing failed'));

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'CurrentPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toThrow('Hashing failed');

      expect(sut.changePasswordAndEnqueueNotification).not.toHaveBeenCalled();
    });

    it('propagates an error when the atomic store operation fails', async () => {
      sut.changePasswordAndEnqueueNotification.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        sut.handler.execute(
          new ChangePasswordCommand(
            'user-123',
            'CurrentPassword123!',
            'NewPassword456!',
          ),
        ),
      ).rejects.toThrow('Database unavailable');

      expect(sut.changePasswordAndEnqueueNotification).toHaveBeenCalledOnce();
    });
  });
});
