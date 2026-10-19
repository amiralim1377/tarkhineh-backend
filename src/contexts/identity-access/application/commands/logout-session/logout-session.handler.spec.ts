import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSessionRepository } from '../../../domain/ports/auth-session.repository.js';
import { InvalidRefreshTokenError } from '../../errors/invalid-refresh-token.error.js';
import type { RefreshTokenFactory } from '../../ports/refresh-token-factory.port.js';
import { LogoutSessionCommand } from './logout-session.command.js';
import { LogoutSessionHandler } from './logout-session.handler.js';

const VALID_REFRESH_TOKEN = 'A'.repeat(43);
const VALID_CSRF_TOKEN = 'B'.repeat(43);

function createSut() {
  const revokeSessionByTokenHash = vi.fn();
  const hash = vi.fn((value: string) => `hashed:${value}`);

  const sessions = {
    revokeSessionByTokenHash,
  } as unknown as AuthSessionRepository;

  const tokenFactory = {
    hash,
  } as unknown as RefreshTokenFactory;

  const handler = new LogoutSessionHandler(sessions, tokenFactory);

  return {
    handler,
    revokeSessionByTokenHash,
    hash,
  };
}

describe('LogoutSessionHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('revokes the session when the refresh token and CSRF token match', async () => {
    sut.revokeSessionByTokenHash.mockResolvedValue(true);

    const result = await sut.handler.execute(
      new LogoutSessionCommand(VALID_REFRESH_TOKEN, VALID_CSRF_TOKEN),
    );

    expect(sut.hash).toHaveBeenCalledWith(VALID_REFRESH_TOKEN);
    expect(sut.hash).toHaveBeenCalledWith(VALID_CSRF_TOKEN);
    expect(sut.revokeSessionByTokenHash).toHaveBeenCalledWith(
      `hashed:${VALID_REFRESH_TOKEN}`,
      `hashed:${VALID_CSRF_TOKEN}`,
      expect.any(Date),
    );
    expect(result).toEqual({ message: 'Logged out successfully.' });
  });

  it('rejects malformed tokens before accessing the repository', async () => {
    await expect(
      sut.handler.execute(
        new LogoutSessionCommand('invalid-refresh-token', VALID_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    await expect(
      sut.handler.execute(
        new LogoutSessionCommand(VALID_REFRESH_TOKEN, 'invalid-csrf-token'),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.revokeSessionByTokenHash).not.toHaveBeenCalled();
  });

  it('rejects a missing session or mismatched CSRF token', async () => {
    sut.revokeSessionByTokenHash.mockResolvedValue(false);

    await expect(
      sut.handler.execute(
        new LogoutSessionCommand(VALID_REFRESH_TOKEN, VALID_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });
});
