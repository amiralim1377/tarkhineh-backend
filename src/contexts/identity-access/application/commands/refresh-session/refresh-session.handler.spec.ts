import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthSessionRepository,
  RefreshTokenRotationResult,
  RotateRefreshTokenInput,
} from '../../../domain/ports/auth-session.repository.js';
import { InvalidRefreshTokenError } from '../../errors/invalid-refresh-token.error.js';
import type { AccessTokenIssuer } from '../../ports/access-token-issuer.port.js';
import type { AuthSessionPolicy } from '../../ports/auth-session-policy.port.js';
import type { RefreshTokenFactory } from '../../ports/refresh-token-factory.port.js';
import { RefreshSessionCommand } from './refresh-session.command.js';
import { RefreshSessionHandler } from './refresh-session.handler.js';

const CURRENT_REFRESH_TOKEN = 'A'.repeat(43);
const CURRENT_CSRF_TOKEN = 'B'.repeat(43);
const NEW_REFRESH_TOKEN = 'C'.repeat(43);
const NEW_CSRF_TOKEN = 'D'.repeat(43);

function createSut() {
  const rotateRefreshToken = vi.fn(
    async (
      _input: RotateRefreshTokenInput,
    ): Promise<RefreshTokenRotationResult> => ({ status: 'INVALID' }),
  );

  const createRefreshToken = vi.fn();
  const hashToken = vi.fn((token: string) => `hash:${token}`);
  const issueFor = vi.fn(async (_userId: string) => ({
    accessToken: 'new-access-token',
    expiresInSeconds: 900,
  }));

  const factory = {
    create: createRefreshToken,
    hash: hashToken,
  } as unknown as RefreshTokenFactory;

  const sessions = {
    rotateRefreshToken,
  } as unknown as AuthSessionRepository;

  const policy: AuthSessionPolicy = {
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    sessionTtlSeconds: 30 * 24 * 60 * 60,
  };

  const tokenIssuer = { issueFor } as unknown as AccessTokenIssuer;

  const handler = new RefreshSessionHandler(
    sessions,
    factory,
    policy,
    tokenIssuer,
  );

  return {
    handler,
    rotateRefreshToken,
    createRefreshToken,
    hashToken,
    issueFor,
    policy,
  };
}

describe('RefreshSessionHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('rotates a valid refresh token and issues new access and CSRF tokens', async () => {
    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    sut.createRefreshToken
      .mockReturnValueOnce({
        token: NEW_REFRESH_TOKEN,
        tokenHash: 'new-refresh-hash',
      })
      .mockReturnValueOnce({
        token: NEW_CSRF_TOKEN,
        tokenHash: 'new-csrf-hash',
      });

    sut.rotateRefreshToken.mockResolvedValueOnce({
      status: 'ROTATED',
      userId: 'user-123',
      sessionId: 'session-123',
      sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      refreshTokenExpiresAt,
    });

    const result = await sut.handler.execute(
      new RefreshSessionCommand(CURRENT_REFRESH_TOKEN, CURRENT_CSRF_TOKEN),
    );

    expect(sut.hashToken).toHaveBeenCalledWith(CURRENT_REFRESH_TOKEN);
    expect(sut.hashToken).toHaveBeenCalledWith(CURRENT_CSRF_TOKEN);
    expect(sut.createRefreshToken).toHaveBeenCalledTimes(2);

    expect(sut.rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTokenHash: `hash:${CURRENT_REFRESH_TOKEN}`,
        currentCsrfTokenHash: `hash:${CURRENT_CSRF_TOKEN}`,
        replacementTokenHash: 'new-refresh-hash',
        replacementCsrfTokenHash: 'new-csrf-hash',
        now: expect.any(Date),
        replacementExpiresAt: expect.any(Date),
      }),
    );

    const rotationInput = sut.rotateRefreshToken.mock.calls[0]?.[0];
    expect(rotationInput).toBeDefined();

    if (!rotationInput) {
      throw new Error('Expected refresh token rotation input');
    }

    expect(
      rotationInput.replacementExpiresAt.getTime() - rotationInput.now.getTime(),
    ).toBe(sut.policy.refreshTokenTtlSeconds * 1000);

    expect(sut.issueFor).toHaveBeenCalledWith('user-123');

    expect(result).toEqual({
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshToken: NEW_REFRESH_TOKEN,
      refreshTokenExpiresAt,
      csrfToken: NEW_CSRF_TOKEN,
    });
  });

  it('rejects malformed refresh or CSRF tokens before touching the repository', async () => {
    await expect(
      sut.handler.execute(
        new RefreshSessionCommand('malformed', CURRENT_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    await expect(
      sut.handler.execute(
        new RefreshSessionCommand(CURRENT_REFRESH_TOKEN, 'malformed'),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.rotateRefreshToken).not.toHaveBeenCalled();
    expect(sut.createRefreshToken).not.toHaveBeenCalled();
    expect(sut.issueFor).not.toHaveBeenCalled();
  });

  it('rejects an unknown, expired or otherwise invalid refresh token', async () => {
    sut.createRefreshToken
      .mockReturnValueOnce({
        token: NEW_REFRESH_TOKEN,
        tokenHash: 'new-refresh-hash',
      })
      .mockReturnValueOnce({
        token: NEW_CSRF_TOKEN,
        tokenHash: 'new-csrf-hash',
      });
    sut.rotateRefreshToken.mockResolvedValueOnce({ status: 'INVALID' });

    await expect(
      sut.handler.execute(
        new RefreshSessionCommand(CURRENT_REFRESH_TOKEN, CURRENT_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.issueFor).not.toHaveBeenCalled();
  });

  it('rejects token reuse after the repository has revoked the session', async () => {
    sut.createRefreshToken
      .mockReturnValueOnce({
        token: NEW_REFRESH_TOKEN,
        tokenHash: 'new-refresh-hash',
      })
      .mockReturnValueOnce({
        token: NEW_CSRF_TOKEN,
        tokenHash: 'new-csrf-hash',
      });
    sut.rotateRefreshToken.mockResolvedValueOnce({
      status: 'REUSE_DETECTED',
    });

    await expect(
      sut.handler.execute(
        new RefreshSessionCommand(CURRENT_REFRESH_TOKEN, CURRENT_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.issueFor).not.toHaveBeenCalled();
  });
});
