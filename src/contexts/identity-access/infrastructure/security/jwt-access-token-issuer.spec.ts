import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { JwtAccessTokenIssuer } from './jwt-access-token-issuer.js';

const JWT_SECRET = 'test-secret-key-with-at-least-32-characters';

describe('JwtAccessTokenIssuer', () => {
  it('issues a signed JWT with the user ID and configured expiration', async () => {
    const jwtService = new JwtService({
      secret: JWT_SECRET,
    });

    const configService = {
      get: vi.fn().mockReturnValue(900),
    } as unknown as ConfigService;

    const issuer = new JwtAccessTokenIssuer(jwtService, configService);

    const result = await issuer.issueFor('user-123');

    expect(result.accessToken).toBeTruthy();
    expect(result.expiresInSeconds).toBe(900);

    const payload = await jwtService.verifyAsync<{
      sub: string;
      iat: number;
      exp: number;
    }>(result.accessToken, {
      secret: JWT_SECRET,
    });

    expect(payload.sub).toBe('user-123');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('uses the default expiration when no configured TTL is available', async () => {
    const jwtService = new JwtService({
      secret: JWT_SECRET,
    });

    const configService = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const issuer = new JwtAccessTokenIssuer(jwtService, configService);

    const result = await issuer.issueFor('user-456');

    expect(result.expiresInSeconds).toBe(900);

    const payload = await jwtService.verifyAsync<{
      sub: string;
      iat: number;
      exp: number;
    }>(result.accessToken, {
      secret: JWT_SECRET,
    });

    expect(payload.sub).toBe('user-456');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('rejects an invalid configured expiration', async () => {
    const jwtService = new JwtService({
      secret: JWT_SECRET,
    });

    const configService = {
      get: vi.fn().mockReturnValue(0),
    } as unknown as ConfigService;

    const issuer = new JwtAccessTokenIssuer(jwtService, configService);

    await expect(issuer.issueFor('user-123')).rejects.toThrow(
      'JWT_ACCESS_TTL_SECONDS must be a positive integer',
    );
  });
});
