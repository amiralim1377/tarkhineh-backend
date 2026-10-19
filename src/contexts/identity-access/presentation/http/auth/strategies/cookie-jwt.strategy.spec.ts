import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenIdentityReader } from '../../../../application/ports/access-token-identity-reader.port.js';
import type { AccessTokenValidator } from '../../../../application/ports/access-token-validator.port.js';
import type { AccessTokenIdentityRecord } from '../../../../application/ports/access-token-identity-reader.port.js';

import {
  ACCESS_TOKEN_COOKIE_NAME,
  CookieJwtStrategy,
} from './cookie-jwt.strategy.js';
import { AuthType } from '../contracts/auth-type.enum.js';

const USER_ID = 'user-cookie-123';
const TOKEN = 'jwt.good.token';
const EXPIRES_AT = 2_000_000_000;
const VERIFIED_DATE = new Date('2026-01-01T00:00:00.000Z');

function activeIdentity(): AccessTokenIdentityRecord {
  return {
    id: USER_ID,
    status: 'ACTIVE',
    emailVerifiedAt: VERIFIED_DATE,
  };
}

function requestWithCookie(cookie?: string): Request {
  return {
    headers: cookie === undefined ? {} : { cookie },
  } as Request;
}

describe('CookieJwtStrategy', () => {
  let validatorMock: { validate: ReturnType<typeof vi.fn> };
  let identityReaderMock: { findById: ReturnType<typeof vi.fn> };
  let strategy: CookieJwtStrategy;

  beforeEach(() => {
    validatorMock = {
      validate: vi.fn().mockResolvedValue({
        userId: USER_ID,
        expiresAt: EXPIRES_AT,
      }),
    };

    identityReaderMock = {
      findById: vi.fn().mockResolvedValue(activeIdentity()),
    };

    strategy = new CookieJwtStrategy(
      validatorMock as unknown as AccessTokenValidator,
      identityReaderMock as unknown as AccessTokenIdentityReader,
    );
  });

  it('declares the Cookie authentication type', () => {
    expect(strategy.authType).toBe(AuthType.Cookie);
  });

  it('returns null when the Cookie header is missing', async () => {
    await expect(strategy.authenticate(requestWithCookie())).resolves.toBeNull();

    expect(validatorMock.validate).not.toHaveBeenCalled();
    expect(identityReaderMock.findById).not.toHaveBeenCalled();
  });

  it('ignores requests without the access-token cookie', async () => {
    await expect(
      strategy.authenticate(requestWithCookie('theme=dark; language=en')),
    ).resolves.toBeNull();

    expect(validatorMock.validate).not.toHaveBeenCalled();
  });

  it('rejects an empty access-token cookie', async () => {
    await expect(
      strategy.authenticate(
        requestWithCookie(`${ACCESS_TOKEN_COOKIE_NAME}=`),
      ),
    ).resolves.toBeNull();

    expect(validatorMock.validate).not.toHaveBeenCalled();
  });

  it('rejects duplicate access-token cookies as ambiguous', async () => {
    await expect(
      strategy.authenticate(
        requestWithCookie(
          `${ACCESS_TOKEN_COOKIE_NAME}=first; ${ACCESS_TOKEN_COOKIE_NAME}=second`,
        ),
      ),
    ).resolves.toBeNull();

    expect(validatorMock.validate).not.toHaveBeenCalled();
  });

  it('decodes the cookie value and validates the token', async () => {
    const encodedToken = encodeURIComponent(TOKEN);

    await expect(
      strategy.authenticate(
        requestWithCookie(`theme=dark; ${ACCESS_TOKEN_COOKIE_NAME}=${encodedToken}`),
      ),
    ).resolves.toEqual({ userId: USER_ID });

    expect(validatorMock.validate).toHaveBeenCalledWith(TOKEN);
    expect(identityReaderMock.findById).toHaveBeenCalledWith(USER_ID);
  });

  it('returns null when the token validator rejects the token', async () => {
    validatorMock.validate.mockResolvedValueOnce(null);

    await expect(
      strategy.authenticate(
        requestWithCookie(`${ACCESS_TOKEN_COOKIE_NAME}=invalid-token`),
      ),
    ).resolves.toBeNull();

    expect(identityReaderMock.findById).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'identity does not exist',
      identity: null,
    },
    {
      scenario: 'account is suspended',
      identity: {
        id: USER_ID,
        status: 'SUSPENDED',
        emailVerifiedAt: VERIFIED_DATE,
      },
    },
    {
      scenario: 'email is not verified',
      identity: {
        id: USER_ID,
        status: 'ACTIVE',
        emailVerifiedAt: null,
      },
    },
  ])('returns null when $scenario', async ({ identity }) => {
    identityReaderMock.findById.mockResolvedValueOnce(identity);

    await expect(
      strategy.authenticate(
        requestWithCookie(`${ACCESS_TOKEN_COOKIE_NAME}=${TOKEN}`),
      ),
    ).resolves.toBeNull();
  });

  it('propagates unexpected identity-reader failures', async () => {
    identityReaderMock.findById.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );

    await expect(
      strategy.authenticate(
        requestWithCookie(`${ACCESS_TOKEN_COOKIE_NAME}=${TOKEN}`),
      ),
    ).rejects.toThrow('Database unavailable');
  });
});
