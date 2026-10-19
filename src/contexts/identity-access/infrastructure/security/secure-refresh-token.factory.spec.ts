import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { SecureRefreshTokenFactory } from './secure-refresh-token.factory.js';

describe('SecureRefreshTokenFactory', () => {
  const factory = new SecureRefreshTokenFactory();

  it('creates a 32-byte cryptographically random URL-safe token', () => {
    const generated = factory.create();

    expect(generated.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(generated.token, 'base64url')).toHaveLength(32);
  });

  it('stores a SHA-256 hash rather than the raw token', () => {
    const generated = factory.create();
    const expectedHash = createHash('sha256')
      .update(generated.token, 'utf8')
      .digest('hex');

    expect(generated.tokenHash).toBe(expectedHash);
    expect(generated.tokenHash).not.toBe(generated.token);
    expect(generated.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different tokens on independent calls', () => {
    const first = factory.create();
    const second = factory.create();

    expect(second.token).not.toBe(first.token);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it('generates a stable hash for the same token', () => {
    const generated = factory.create();

    expect(factory.hash(generated.token)).toBe(generated.tokenHash);
    expect(factory.hash(generated.token)).toBe(factory.hash(generated.token));
  });

  it('produces different hashes for different tokens', () => {
    expect(factory.hash('refresh-token-a')).not.toBe(
      factory.hash('refresh-token-b'),
    );
  });
});
