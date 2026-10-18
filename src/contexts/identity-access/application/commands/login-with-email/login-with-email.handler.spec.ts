import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityUser } from '../../../domain/entities/identity-user.js';
import { InvalidCredentialsError } from '../../errors/invalid-credentials.error.js';
import { LoginWithEmailCommand } from './login-with-email.command.js';
import { LoginWithEmailHandler } from './login-with-email.handler.js';

function createActiveUser(): IdentityUser {
  return IdentityUser.provisionVerified({
    id: 'user-123',
    email: 'user@example.com',
    emailVerifiedAt: new Date('2026-10-18T12:00:00.000Z'),
    passwordHash: 'argon2-test-hash',
    displayName: 'Test User',
  });
}

function createSut() {
  const findByEmail = vi.fn();
  const verifyPassword = vi.fn();
  const issueFor = vi.fn();

  const handler = new LoginWithEmailHandler(
    { findByEmail },
    { verify: verifyPassword },
    { issueFor },
  );

  return {
    handler,
    findByEmail,
    verifyPassword,
    issueFor,
  };
}

describe('LoginWithEmailHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('normalizes the email, verifies the password and issues an access token', async () => {
    const user = createActiveUser();

    sut.findByEmail.mockResolvedValue(user);
    sut.verifyPassword.mockResolvedValue(true);
    sut.issueFor.mockResolvedValue({
      accessToken: 'test-access-token',
      expiresInSeconds: 900,
    });

    const result = await sut.handler.execute(
      new LoginWithEmailCommand('  User@Example.com  ', 'CorrectPassword123!'),
    );

    expect(sut.findByEmail).toHaveBeenCalledWith('user@example.com');

    expect(sut.verifyPassword).toHaveBeenCalledWith(
      'argon2-test-hash',
      'CorrectPassword123!',
    );

    expect(sut.issueFor).toHaveBeenCalledWith('user-123');

    expect(result).toEqual({
      accessToken: 'test-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
      },
    });

    expect(JSON.stringify(result)).not.toContain('argon2-test-hash');
  });

  it('rejects an unknown email without verifying a password or issuing a token', async () => {
    sut.findByEmail.mockResolvedValue(null);

    await expect(
      sut.handler.execute(
        new LoginWithEmailCommand('missing@example.com', 'SomePassword123!'),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(sut.verifyPassword).not.toHaveBeenCalled();
    expect(sut.issueFor).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password without issuing a token', async () => {
    sut.findByEmail.mockResolvedValue(createActiveUser());
    sut.verifyPassword.mockResolvedValue(false);

    await expect(
      sut.handler.execute(
        new LoginWithEmailCommand('user@example.com', 'WrongPassword123!'),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(sut.verifyPassword).toHaveBeenCalledOnce();
    expect(sut.issueFor).not.toHaveBeenCalled();
  });

  it('rejects a user whose email is not verified', async () => {
    const pendingUser = IdentityUser.registerPending({
      id: 'user-pending',
      email: 'pending@example.com',
      passwordHash: 'argon2-test-hash',
      displayName: 'Pending User',
    });

    sut.findByEmail.mockResolvedValue(pendingUser);

    await expect(
      sut.handler.execute(
        new LoginWithEmailCommand('pending@example.com', 'Password123!'),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(sut.verifyPassword).not.toHaveBeenCalled();
    expect(sut.issueFor).not.toHaveBeenCalled();
  });

  it('rejects a suspended user without issuing a token', async () => {
    const suspendedUser = IdentityUser.reconstitute({
      id: 'user-suspended',
      email: 'suspended@example.com',
      emailVerifiedAt: new Date('2026-10-18T12:00:00.000Z'),
      passwordHash: 'argon2-test-hash',
      displayName: 'Suspended User',
      status: 'SUSPENDED',
    });

    sut.findByEmail.mockResolvedValue(suspendedUser);

    await expect(
      sut.handler.execute(
        new LoginWithEmailCommand(
          'suspended@example.com',
          'CorrectPassword123!',
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(sut.verifyPassword).not.toHaveBeenCalled();
    expect(sut.issueFor).not.toHaveBeenCalled();
  });
});
