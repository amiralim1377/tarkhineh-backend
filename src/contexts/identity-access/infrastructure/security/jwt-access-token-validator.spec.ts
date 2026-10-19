import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { JwtAccessTokenValidator } from './jwt-access-token-validator.js';

const JWT_SECRET = 'test-secret-key-with-at-least-32-characters';

describe('JwtAccessTokenValidator', () => {
  const jwtService = new JwtService({
    secret: JWT_SECRET,
  });

  const validator = new JwtAccessTokenValidator(jwtService);

  it('accepts a valid signed token and extracts the user ID', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-123' },
      { expiresIn: 900 },
    );

    await expect(validator.validate(token)).resolves.toMatchObject({
      userId: 'user-123',
      expiresAt: expect.any(Number),
    });
  });

  it('rejects an expired token', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-123' },
      { expiresIn: -60 },
    );

    await expect(validator.validate(token)).resolves.toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-123' },
      { expiresIn: 900 },
    );

    const tamperedToken = `${token.slice(0, -1)}x`;

    await expect(validator.validate(tamperedToken)).resolves.toBeNull();
  });

  it('rejects a token without a subject', async () => {
    const token = await jwtService.signAsync(
      { purpose: 'test' },
      { expiresIn: 900 },
    );

    await expect(validator.validate(token)).resolves.toBeNull();
  });

  it('rejects a token without an expiration claim', async () => {
    const token = await jwtService.signAsync({
      sub: 'user-123',
    });

    await expect(validator.validate(token)).resolves.toBeNull();
  });
});
