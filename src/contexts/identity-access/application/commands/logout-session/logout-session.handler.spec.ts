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

  const fixedNow = new Date('2026-10-19T10:00:00.000Z');

  const clock = {
    now: vi.fn(() => new Date(fixedNow.getTime())),
  };

  const sessions = {
    revokeSessionByTokenHash,
  } as unknown as AuthSessionRepository;

  const tokenFactory = {
    hash,
  } as unknown as RefreshTokenFactory;

  const handler = new LogoutSessionHandler(sessions, tokenFactory, clock);

  return {
    handler,
    revokeSessionByTokenHash,
    hash,
    clock,
    fixedNow,
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

    expect(sut.hash).toHaveBeenCalledTimes(2);
    expect(sut.hash).toHaveBeenNthCalledWith(1, VALID_REFRESH_TOKEN);
    expect(sut.hash).toHaveBeenNthCalledWith(2, VALID_CSRF_TOKEN);

    expect(sut.clock.now).toHaveBeenCalledOnce();

    expect(sut.revokeSessionByTokenHash).toHaveBeenCalledOnce();
    expect(sut.revokeSessionByTokenHash).toHaveBeenCalledWith(
      `hashed:${VALID_REFRESH_TOKEN}`,
      `hashed:${VALID_CSRF_TOKEN}`,
      sut.fixedNow,
    );

    expect(result).toEqual({
      message: 'Logged out successfully.',
    });
  });

  it('rejects a malformed refresh token before accessing dependencies', async () => {
    await expect(
      sut.handler.execute(
        new LogoutSessionCommand('invalid-refresh-token', VALID_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.hash).not.toHaveBeenCalled();
    expect(sut.clock.now).not.toHaveBeenCalled();
    expect(sut.revokeSessionByTokenHash).not.toHaveBeenCalled();
  });

  it('rejects a malformed CSRF token before accessing dependencies', async () => {
    await expect(
      sut.handler.execute(
        new LogoutSessionCommand(VALID_REFRESH_TOKEN, 'invalid-csrf-token'),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.hash).not.toHaveBeenCalled();
    expect(sut.clock.now).not.toHaveBeenCalled();
    expect(sut.revokeSessionByTokenHash).not.toHaveBeenCalled();
  });

  it('rejects logout when the session is not found or the CSRF token does not match', async () => {
    sut.revokeSessionByTokenHash.mockResolvedValue(false);

    await expect(
      sut.handler.execute(
        new LogoutSessionCommand(VALID_REFRESH_TOKEN, VALID_CSRF_TOKEN),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(sut.hash).toHaveBeenCalledTimes(2);
    expect(sut.clock.now).toHaveBeenCalledOnce();
    expect(sut.revokeSessionByTokenHash).toHaveBeenCalledOnce();
  });

  it('uses the injected clock instead of the system clock', async () => {
    sut.revokeSessionByTokenHash.mockResolvedValue(true);

    await sut.handler.execute(
      new LogoutSessionCommand(VALID_REFRESH_TOKEN, VALID_CSRF_TOKEN),
    );

    const passedNow = sut.revokeSessionByTokenHash.mock.calls[0]?.[2];

    expect(passedNow).toEqual(sut.fixedNow);
    expect(passedNow).not.toBe(sut.fixedNow);
  });
});
