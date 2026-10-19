import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityUser } from '../../../domain/entities/identity-user.js';
import type {
  AuthSessionRepository,
  CreateAuthSessionInput,
  CreatedAuthSession,
} from '../../../domain/ports/auth-session.repository.js';
import type { RefreshTokenFactory } from '../../ports/refresh-token-factory.port.js';
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
  const createRefreshToken = vi.fn();

  const createSession = vi.fn(
    async (input: CreateAuthSessionInput): Promise<CreatedAuthSession> => ({
      sessionId: 'session-123',
      sessionExpiresAt: input.sessionExpiresAt,
      refreshTokenExpiresAt: new Date(
        Math.min(
          input.refreshTokenExpiresAt.getTime(),
          input.sessionExpiresAt.getTime(),
        ),
      ),
    }),
  );

  const sessionPolicy = {
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    sessionTtlSeconds: 30 * 24 * 60 * 60,
  };

  const handler = new LoginWithEmailHandler(
    { findByEmail },
    { verify: verifyPassword },
    { issueFor },
    { createSession } as unknown as AuthSessionRepository,
    { create: createRefreshToken } as unknown as RefreshTokenFactory,
    sessionPolicy,
  );

  return {
    handler,
    findByEmail,
    verifyPassword,
    issueFor,
    createSession,
    createRefreshToken,
    sessionPolicy,
  };
}

describe('LoginWithEmailHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('normalizes email, verifies credentials, creates a session and issues tokens', async () => {
    const user = createActiveUser();

    sut.findByEmail.mockResolvedValue(user);
    sut.verifyPassword.mockResolvedValue(true);
    sut.issueFor.mockResolvedValue({
      accessToken: 'test-access-token',
      expiresInSeconds: 900,
    });
    sut.createRefreshToken
      .mockReturnValueOnce({
        token: 'test-refresh-token',
        tokenHash: 'test-refresh-token-hash',
      })
      .mockReturnValueOnce({
        token: 'test-csrf-token',
        tokenHash: 'test-csrf-token-hash',
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
    expect(sut.createRefreshToken).toHaveBeenCalledTimes(2);

    expect(sut.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        initialRefreshTokenHash: 'test-refresh-token-hash',
        csrfTokenHash: 'test-csrf-token-hash',
        now: expect.any(Date),
        sessionExpiresAt: expect.any(Date),
        refreshTokenExpiresAt: expect.any(Date),
      }),
    );

    const sessionInput = sut.createSession.mock.calls[0]?.[0];
    expect(sessionInput).toBeDefined();

    if (!sessionInput) {
      throw new Error('Expected a session creation input');
    }

    expect(
      sessionInput.sessionExpiresAt.getTime() - sessionInput.now.getTime(),
    ).toBe(sut.sessionPolicy.sessionTtlSeconds * 1000);

    expect(
      sessionInput.refreshTokenExpiresAt.getTime() - sessionInput.now.getTime(),
    ).toBe(sut.sessionPolicy.refreshTokenTtlSeconds * 1000);

    expect(result).toEqual({
      accessToken: 'test-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshToken: 'test-refresh-token',
      refreshTokenExpiresAt: expect.any(Date),
      csrfToken: 'test-csrf-token',
      user: {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
      },
    });

    expect(JSON.stringify(result)).not.toContain('argon2-test-hash');
  });

  it('rejects an unknown email without verifying credentials or creating a session', async () => {
    sut.findByEmail.mockResolvedValue(null);

    await expect(
      sut.handler.execute(
        new LoginWithEmailCommand('missing@example.com', 'SomePassword123!'),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(sut.verifyPassword).not.toHaveBeenCalled();
    expect(sut.issueFor).not.toHaveBeenCalled();
    expect(sut.createRefreshToken).not.toHaveBeenCalled();
    expect(sut.createSession).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password without creating tokens or a session', async () => {
    sut.findByEmail.mockResolvedValue(createActiveUser());
    sut.verifyPassword.mockResolvedValue(false);

    await expect(
      sut.handler.execute(
        new LoginWithEmailCommand('user@example.com', 'WrongPassword123!'),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(sut.verifyPassword).toHaveBeenCalledOnce();
    expect(sut.issueFor).not.toHaveBeenCalled();
    expect(sut.createRefreshToken).not.toHaveBeenCalled();
    expect(sut.createSession).not.toHaveBeenCalled();
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
    expect(sut.createSession).not.toHaveBeenCalled();
  });

  it('rejects a suspended user without creating a session', async () => {
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
    expect(sut.createSession).not.toHaveBeenCalled();
  });
});
