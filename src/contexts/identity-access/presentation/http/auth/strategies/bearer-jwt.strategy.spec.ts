import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenValidator } from '../../../../application/ports/access-token-validator.port.js';
import type { AccessTokenIdentityReader } from '../../../../application/ports/access-token-identity-reader.port.js';

import { BearerJwtStrategy } from './bearer-jwt.strategy.js';

function createRequest(authorization?: string): Request {
  return {
    headers: {
      ...(authorization ? { authorization } : {}),
    },
  } as Request;
}

function createSut() {
  const tokenValidator: AccessTokenValidator = {
    validate: vi.fn(),
  };

  const identityReader: AccessTokenIdentityReader = {
    findById: vi.fn(),
  };

  const strategy = new BearerJwtStrategy(
    tokenValidator,
    identityReader,
  );

  return {
    strategy,
    tokenValidator,
    identityReader,
  };
}

describe('BearerJwtStrategy', () => {
  it('authenticates an active user with a verified email', async () => {
    const sut = createSut();

    vi.mocked(sut.tokenValidator.validate).mockResolvedValue({
      userId: 'user-123',
      expiresAt: 1_900_000_000,
    });

    vi.mocked(sut.identityReader.findById).mockResolvedValue({
      id: 'user-123',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-10-19T08:00:00.000Z'),
    });

    await expect(
      sut.strategy.authenticate(
        createRequest('Bearer valid-test-token'),
      ),
    ).resolves.toEqual({
      userId: 'user-123',
    });

    expect(sut.tokenValidator.validate).toHaveBeenCalledWith(
      'valid-test-token',
    );

    expect(sut.identityReader.findById).toHaveBeenCalledWith(
      'user-123',
    );
  });

  it('rejects a missing Authorization header', async () => {
    const sut = createSut();

    await expect(
      sut.strategy.authenticate(createRequest()),
    ).resolves.toBeNull();

    expect(sut.tokenValidator.validate).not.toHaveBeenCalled();
    expect(sut.identityReader.findById).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const sut = createSut();

    await expect(
      sut.strategy.authenticate(
        createRequest('Basic some-credentials'),
      ),
    ).resolves.toBeNull();

    expect(sut.tokenValidator.validate).not.toHaveBeenCalled();
  });

  it('rejects an invalid token without looking up a user', async () => {
    const sut = createSut();

    vi.mocked(sut.tokenValidator.validate).mockResolvedValue(null);

    await expect(
      sut.strategy.authenticate(
        createRequest('Bearer invalid-test-token'),
      ),
    ).resolves.toBeNull();

    expect(sut.identityReader.findById).not.toHaveBeenCalled();
  });

  it('rejects a user who no longer exists', async () => {
    const sut = createSut();

    vi.mocked(sut.tokenValidator.validate).mockResolvedValue({
      userId: 'deleted-user',
      expiresAt: 1_900_000_000,
    });

    vi.mocked(sut.identityReader.findById).mockResolvedValue(null);

    await expect(
      sut.strategy.authenticate(
        createRequest('Bearer valid-test-token'),
      ),
    ).resolves.toBeNull();
  });

  it('rejects a suspended user', async () => {
    const sut = createSut();

    vi.mocked(sut.tokenValidator.validate).mockResolvedValue({
      userId: 'user-123',
      expiresAt: 1_900_000_000,
    });

    vi.mocked(sut.identityReader.findById).mockResolvedValue({
      id: 'user-123',
      status: 'SUSPENDED',
      emailVerifiedAt: new Date('2026-10-19T08:00:00.000Z'),
    });

    await expect(
      sut.strategy.authenticate(
        createRequest('Bearer valid-test-token'),
      ),
    ).resolves.toBeNull();
  });

  it('rejects a user whose email is not verified', async () => {
    const sut = createSut();

    vi.mocked(sut.tokenValidator.validate).mockResolvedValue({
      userId: 'user-123',
      expiresAt: 1_900_000_000,
    });

    vi.mocked(sut.identityReader.findById).mockResolvedValue({
      id: 'user-123',
      status: 'PENDING',
      emailVerifiedAt: null,
    });

    await expect(
      sut.strategy.authenticate(
        createRequest('Bearer valid-test-token'),
      ),
    ).resolves.toBeNull();
  });

  it('propagates unexpected identity-reader failures', async () => {
    const sut = createSut();

    vi.mocked(sut.tokenValidator.validate).mockResolvedValue({
      userId: 'user-123',
      expiresAt: 1_900_000_000,
    });

    vi.mocked(sut.identityReader.findById).mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(
      sut.strategy.authenticate(
        createRequest('Bearer valid-test-token'),
      ),
    ).rejects.toThrow('Database unavailable');
  });
});
