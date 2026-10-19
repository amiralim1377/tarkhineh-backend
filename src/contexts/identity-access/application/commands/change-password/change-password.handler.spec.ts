import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityUser } from '../../../domain/entities/identity-user.js';
import type { AuthSessionRepository } from '../../../domain/ports/auth-session.repository.js';
import type { UserAuthenticationRepository } from '../../../domain/ports/user-authentication.repository.js';
import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import type { PasswordHasher } from '../../ports/password-hasher.port.js';
import type { PasswordVerifier } from '../../ports/password-verifier.port.js';
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
  const changePassword = vi.fn();
  const verify = vi.fn();
  const hash = vi.fn();
  const revokeAllSessionsForUser = vi.fn();
  const now = vi.fn(() => new Date(FIXED_NOW.getTime()));

  const users = {
    findById,
    findByEmail: vi.fn(),
    changePassword,
  } as unknown as UserAuthenticationRepository;

  const passwordVerifier = {
    verify,
  } as PasswordVerifier;

  const passwordHasher = {
    hash,
  } as PasswordHasher;

  const sessions = {
    revokeAllSessionsForUser,
  } as unknown as AuthSessionRepository;

  const clock = { now } as Clock;

  const handler = new ChangePasswordHandler(
    users,
    passwordVerifier,
    passwordHasher,
    sessions,
    clock,
  );

  return {
    handler,
    user,
    findById,
    changePassword,
    verify,
    hash,
    revokeAllSessionsForUser,
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
    sut.changePassword.mockResolvedValue(true);
    sut.revokeAllSessionsForUser.mockResolvedValue(2);
  });
  it('changes the password and revokes refresh sessions', async () => {
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

    expect(sut.findById).toHaveBeenCalledWith('user-123');

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

    expect(sut.hash).toHaveBeenCalledWith('NewPassword456!');

    expect(sut.changePassword).toHaveBeenCalledWith({
      userId: 'user-123',
      currentPasswordHash: 'current-password-hash',
      newPasswordHash: 'new-password-hash',
    });

    expect(sut.revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-123',
      'SECURITY_ACTION',
      FIXED_NOW,
    );
  });

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
    expect(sut.changePassword).not.toHaveBeenCalled();
    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
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
    expect(sut.changePassword).not.toHaveBeenCalled();
    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
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

    expect(sut.hash).not.toHaveBeenCalled();
    expect(sut.changePassword).not.toHaveBeenCalled();
    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
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

    expect(sut.hash).not.toHaveBeenCalled();
    expect(sut.changePassword).not.toHaveBeenCalled();
    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('rejects if the password update fails because the stored hash changed', async () => {
    sut.changePassword.mockResolvedValue(false);

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
    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('does not revoke sessions if password hashing fails', async () => {
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

    expect(sut.changePassword).not.toHaveBeenCalled();
    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('does not revoke sessions if the password update fails', async () => {
    sut.changePassword.mockRejectedValue(new Error('Database unavailable'));

    await expect(
      sut.handler.execute(
        new ChangePasswordCommand(
          'user-123',
          'CurrentPassword123!',
          'NewPassword456!',
        ),
      ),
    ).rejects.toThrow('Database unavailable');

    expect(sut.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('does not expose the new password in the repository call', async () => {
    await sut.handler.execute(
      new ChangePasswordCommand(
        'user-123',
        'CurrentPassword123!',
        'NewPassword456!',
      ),
    );

    expect(sut.changePassword).toHaveBeenCalledWith({
      userId: 'user-123',
      currentPasswordHash: 'current-password-hash',
      newPasswordHash: 'new-password-hash',
    });

    expect(sut.changePassword).not.toHaveBeenCalledWith(
      expect.objectContaining({
        newPasswordHash: 'NewPassword456!',
      }),
    );
  });
});
