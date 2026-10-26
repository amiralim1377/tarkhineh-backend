import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { appCreate } from '../../../src/app.create.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { OUTBOUND_EMAIL_PROVIDER } from '../../../src/contexts/outbound-email/application/ports/outbound-email-provider.port.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBullMqPrefix = process.env.BULLMQ_PREFIX;
const testBullMqPrefix = `tarkhineh-login-e2e-${randomUUID()}`;

function createTestDatabaseUrl(configuredUrl: string | undefined): string {
  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for E2E tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName === 'tarkhineh_test') {
    return url.toString();
  }

  if (databaseName !== 'tarkhineh_db') {
    throw new Error('Refusing to run E2E tests against an unexpected database');
  }

  url.pathname = '/tarkhineh_test';
  return url.toString();
}

function restoreEnvironmentVariable(
  name: string,
  originalValue: string | undefined,
): void {
  if (originalValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = originalValue;
  }
}

describe('Identity access authentication (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const testEmails = new Set<string>();

  const outboundEmailProviderMock = {
    send: vi.fn().mockResolvedValue({
      providerMessageId: 'e2e-provider-message-id',
    }),
  };

  beforeAll(async () => {
    // Force all test database operations to use the isolated database.
    process.env.DATABASE_URL = createTestDatabaseUrl(originalDatabaseUrl);

    // Avoid sharing the BullMQ namespace with other application runs.
    process.env.BULLMQ_PREFIX = testBullMqPrefix;

    // Import after setting the environment variables.
    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OUTBOUND_EMAIL_PROVIDER)
      .useValue(outboundEmailProviderMock)
      .compile();

    app = moduleRef.createNestApplication();
    appCreate(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService, { strict: false });
  });

  afterEach(async () => {
    if (testEmails.size > 0) {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [...testEmails],
          },
        },
      });

      testEmails.clear();
    }

    outboundEmailProviderMock.send.mockClear();
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      restoreEnvironmentVariable('DATABASE_URL', originalDatabaseUrl);
      restoreEnvironmentVariable('BULLMQ_PREFIX', originalBullMqPrefix);
    }
  });

  async function createUser(
    email: string,
    password: string,
    status: 'ACTIVE' | 'PENDING' | 'SUSPENDED',
    emailVerifiedAt: Date | null,
  ): Promise<{ id: string; passwordHash: string }> {
    const passwordHash = await hash(password);
    testEmails.add(email);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Login E2E User',
        status,
        emailVerifiedAt,
      },
      select: {
        id: true,
      },
    });

    return {
      id: user.id,
      passwordHash,
    };
  }

  it('authenticates a verified user and returns a valid signed JWT', async () => {
    const email = `login-success-${randomUUID()}@example.com`;
    const password = 'Login-E2E-Password-123!';
    const emailVerifiedAt = new Date();

    const user = await createUser(email, password, 'ACTIVE', emailVerifiedAt);

    const response = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
      user: {
        id: user.id,
        email,
        displayName: 'Login E2E User',
      },
    });

    expect(JSON.stringify(response.body)).not.toContain(user.passwordHash);
    expect(JSON.stringify(response.body)).not.toContain(password);

    const payload = await jwtService.verifyAsync<{
      sub: string;
      iat: number;
      exp: number;
    }>(response.body.accessToken);

    expect(payload.sub).toBe(user.id);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBe(response.body.expiresIn);
  });

  it('detects reuse and revokes the session when the same refresh token is used concurrently', async () => {
    const email = `refresh-concurrent-${randomUUID()}@example.com`;
    const password = 'Refresh-Concurrent-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const csrfToken = loginResponse.body.csrfToken as string;
    const loginCookies = loginResponse.headers['set-cookie'];

    const refreshCookie = Array.isArray(loginCookies)
      ? loginCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!refreshCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = refreshCookie.split(';')[0];

    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    // Submit two refresh requests concurrently with the same credentials.
    const responses = await Promise.all([
      request(app!.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookiePair)
        .set('X-CSRF-Token', csrfToken),

      request(app!.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookiePair)
        .set('X-CSRF-Token', csrfToken),
    ]);

    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 401]);

    const successfulRefresh = responses.find(
      (response) => response.status === 200,
    );
    const rejectedRefresh = responses.find(
      (response) => response.status === 401,
    );

    if (!successfulRefresh || !rejectedRefresh) {
      throw new Error(
        'Expected one successful and one rejected refresh request',
      );
    }

    expect(successfulRefresh.body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      csrfToken: expect.any(String),
    });

    expect(rejectedRefresh.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(rejectedRefresh.body.message).toBeUndefined();

    // The successful response's replacement token must also be unusable
    // because reuse detection revokes the entire session.
    const rotatedCookies = successfulRefresh.headers['set-cookie'];
    const rotatedCookie = Array.isArray(rotatedCookies)
      ? rotatedCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!rotatedCookie) {
      throw new Error('Successful refresh did not set a replacement cookie');
    }

    const rotatedCookiePair = rotatedCookie.split(';')[0];

    if (!rotatedCookiePair) {
      throw new Error('Could not extract the replacement refresh-token cookie');
    }

    await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookiePair)
      .set('X-CSRF-Token', successfulRefresh.body.csrfToken as string)
      .expect(401);

    const session = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        id: true,
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(session).not.toBeNull();

    if (!session) {
      throw new Error('Authentication session was not found');
    }

    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(session.revocationReason).toBe('REFRESH_TOKEN_REUSE');

    const tokens = await prisma.refreshToken.findMany({
      where: { sessionId: session.id },
      select: { revokedAt: true },
    });

    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('rotates a refresh token and revokes the session when the old token is reused', async () => {
    const email = `refresh-rotation-${randomUUID()}@example.com`;
    const password = 'Refresh-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    // Login creates the initial session and sets the HttpOnly refresh cookie.
    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    expect(loginResponse.body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      csrfToken: expect.any(String),
    });
    expect(loginResponse.body).not.toHaveProperty('refreshToken');

    const loginSetCookies = loginResponse.headers['set-cookie'];
    const initialSetCookie = Array.isArray(loginSetCookies)
      ? loginSetCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!initialSetCookie) {
      throw new Error('Login response did not set a refresh-token cookie');
    }

    expect(initialSetCookie).toContain('HttpOnly');
    expect(initialSetCookie).toContain('SameSite=Lax');
    expect(initialSetCookie).toContain('Path=/auth');

    const initialCookiePair = initialSetCookie.split(';')[0];
    if (!initialCookiePair) {
      throw new Error('Could not extract the initial refresh-token cookie');
    }

    const initialCsrfToken = loginResponse.body.csrfToken as string;

    // A valid refresh rotates both the refresh token and its CSRF token.
    const refreshResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', initialCookiePair)
      .set('X-CSRF-Token', initialCsrfToken)
      .expect(200);

    expect(refreshResponse.body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
      csrfToken: expect.any(String),
    });
    expect(refreshResponse.body).not.toHaveProperty('refreshToken');
    expect(refreshResponse.body.csrfToken).not.toBe(initialCsrfToken);
    expect(refreshResponse.headers['cache-control']).toBe('no-store');

    const refreshedPayload = await jwtService.verifyAsync<{
      sub: string;
      iat: number;
      exp: number;
    }>(refreshResponse.body.accessToken);

    expect(refreshedPayload.sub).toBe(user.id);
    expect(refreshedPayload.exp).toBeGreaterThan(refreshedPayload.iat);

    const refreshSetCookies = refreshResponse.headers['set-cookie'];
    const rotatedSetCookie = Array.isArray(refreshSetCookies)
      ? refreshSetCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!rotatedSetCookie) {
      throw new Error(
        'Refresh response did not rotate the refresh-token cookie',
      );
    }

    expect(rotatedSetCookie).toContain('HttpOnly');
    expect(rotatedSetCookie).toContain('SameSite=Lax');
    expect(rotatedSetCookie).toContain('Path=/auth');

    const rotatedCookiePair = rotatedSetCookie.split(';')[0];
    if (!rotatedCookiePair) {
      throw new Error('Could not extract the rotated refresh-token cookie');
    }

    expect(rotatedCookiePair).not.toBe(initialCookiePair);

    const newCsrfToken = refreshResponse.body.csrfToken as string;

    // Replaying the consumed token with its matching CSRF token must be rejected.
    const replayResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', initialCookiePair)
      .set('X-CSRF-Token', initialCsrfToken)
      .expect(401);

    expect(replayResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(replayResponse.body.message).toBeUndefined();

    // Reuse detection revokes the whole session, including the rotated token.
    await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookiePair)
      .set('X-CSRF-Token', newCsrfToken)
      .expect(401);

    const revokedSession = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(revokedSession).not.toBeNull();
    expect(revokedSession?.revokedAt).toBeInstanceOf(Date);
    expect(revokedSession?.revocationReason).toBe('REFRESH_TOKEN_REUSE');
  });

  it('rejects an expired refresh token without creating a replacement or revoking the session', async () => {
    const email = `refresh-expired-${randomUUID()}@example.com`;
    const password = 'Refresh-Expired-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const csrfToken = loginResponse.body.csrfToken as string;
    const loginCookies = loginResponse.headers['set-cookie'];

    const refreshCookie = Array.isArray(loginCookies)
      ? loginCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!refreshCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = refreshCookie.split(';')[0];

    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    const session = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!session) {
      throw new Error('Login did not create an authentication session');
    }

    // Expire the active refresh token directly in the test database.
    await prisma.refreshToken.updateMany({
      where: {
        sessionId: session.id,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const response = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(response.body.message).toBeUndefined();
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.headers['set-cookie']).toBeUndefined();

    const [persistedSession, tokens] = await Promise.all([
      prisma.authSession.findUnique({
        where: { id: session.id },
        select: {
          revokedAt: true,
          revocationReason: true,
        },
      }),
      prisma.refreshToken.findMany({
        where: { sessionId: session.id },
        select: { id: true },
      }),
    ]);

    // Expiry must not trigger reuse detection or revoke this session.
    expect(persistedSession?.revokedAt).toBeNull();
    expect(persistedSession?.revocationReason).toBeNull();

    // No replacement refresh token should have been created.
    expect(tokens).toHaveLength(1);
  });

  it('rejects an expired session even when its refresh token has not expired', async () => {
    const email = `session-expired-${randomUUID()}@example.com`;
    const password = 'Session-Expired-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const csrfToken = loginResponse.body.csrfToken as string;
    const loginCookies = loginResponse.headers['set-cookie'];

    const refreshCookie = Array.isArray(loginCookies)
      ? loginCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!refreshCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = refreshCookie.split(';')[0];

    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    const session = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!session) {
      throw new Error('Login did not create an authentication session');
    }

    // Expire the session while leaving its refresh token unexpired.
    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(response.body.message).toBeUndefined();
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.headers['set-cookie']).toBeUndefined();

    const [persistedSession, tokens] = await Promise.all([
      prisma.authSession.findUnique({
        where: { id: session.id },
        select: {
          revokedAt: true,
          revocationReason: true,
        },
      }),
      prisma.refreshToken.findMany({
        where: { sessionId: session.id },
        select: { id: true },
      }),
    ]);

    // Expired sessions must not produce replacement refresh tokens.
    expect(tokens).toHaveLength(1);

    // Natural expiry should not be misclassified as token reuse.
    expect(persistedSession?.revokedAt).toBeNull();
    expect(persistedSession?.revocationReason).toBeNull();
  });

  it('rejects missing or malformed refresh cookies without consuming a valid session', async () => {
    const email = `refresh-cookie-${randomUUID()}@example.com`;
    const password = 'Refresh-Cookie-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const csrfToken = loginResponse.body.csrfToken as string;
    const loginCookies = loginResponse.headers['set-cookie'];

    const refreshCookie = Array.isArray(loginCookies)
      ? loginCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!refreshCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = refreshCookie.split(';')[0];

    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    // A missing refresh cookie must be rejected.
    const missingCookieResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(missingCookieResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(missingCookieResponse.body.message).toBeUndefined();
    expect(missingCookieResponse.body).not.toHaveProperty('accessToken');
    expect(missingCookieResponse.headers['set-cookie']).toBeUndefined();

    // A malformed refresh cookie must also be rejected.
    const malformedCookieResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=invalid')
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(malformedCookieResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(malformedCookieResponse.body.message).toBeUndefined();
    expect(malformedCookieResponse.body).not.toHaveProperty('accessToken');
    expect(malformedCookieResponse.headers['set-cookie']).toBeUndefined();

    // Failed requests must not revoke the valid session.
    const session = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(session).not.toBeNull();
    expect(session?.revokedAt).toBeNull();
    expect(session?.revocationReason).toBeNull();

    // The original cookie must still work with the matching CSRF token.
    const validRefreshResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    expect(validRefreshResponse.body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      csrfToken: expect.any(String),
    });
    expect(validRefreshResponse.body).not.toHaveProperty('refreshToken');
    expect(validRefreshResponse.headers['cache-control']).toBe('no-store');
  });

  it('rejects missing or mismatched CSRF tokens without consuming a valid refresh token', async () => {
    const email = `refresh-csrf-${randomUUID()}@example.com`;
    const password = 'Refresh-CSRF-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const csrfToken = loginResponse.body.csrfToken as string;
    const loginCookies = loginResponse.headers['set-cookie'];

    const refreshCookie = Array.isArray(loginCookies)
      ? loginCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!refreshCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = refreshCookie.split(';')[0];
    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    // A missing CSRF header must be rejected.
    const missingCsrfResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .expect(401);

    expect(missingCsrfResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(missingCsrfResponse.body.message).toBeUndefined();

    // A well-formed but mismatched CSRF token must also be rejected.
    const mismatchedCsrfResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', 'A'.repeat(43))
      .expect(401);

    expect(mismatchedCsrfResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(mismatchedCsrfResponse.body.message).toBeUndefined();

    // Failed CSRF validation must not revoke the session.
    const sessionBeforeValidRefresh = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(sessionBeforeValidRefresh).not.toBeNull();
    expect(sessionBeforeValidRefresh?.revokedAt).toBeNull();
    expect(sessionBeforeValidRefresh?.revocationReason).toBeNull();

    // The original refresh token must still work with its matching CSRF token.
    const validRefreshResponse = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    expect(validRefreshResponse.body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      csrfToken: expect.any(String),
    });
    expect(validRefreshResponse.body.csrfToken).not.toBe(csrfToken);
    expect(validRefreshResponse.body).not.toHaveProperty('refreshToken');
    expect(validRefreshResponse.headers['cache-control']).toBe('no-store');
  });

  it('rejects missing or malformed refresh cookies without revoking a valid session on logout', async () => {
    const email = `logout-cookie-${randomUUID()}@example.com`;
    const password = 'Logout-Cookie-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const csrfToken = loginResponse.body.csrfToken as string;
    const loginCookies = loginResponse.headers['set-cookie'];

    const refreshCookie = Array.isArray(loginCookies)
      ? loginCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!refreshCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = refreshCookie.split(';')[0];

    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    // A missing refresh cookie must not be treated as successful logout.
    const missingCookieResponse = await request(app!.getHttpServer())
      .post('/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(missingCookieResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(missingCookieResponse.body.message).toBeUndefined();
    expect(missingCookieResponse.headers['set-cookie']).toBeUndefined();

    // A malformed refresh cookie must also be rejected.
    const malformedCookieResponse = await request(app!.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', 'refresh_token=invalid')
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(malformedCookieResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(malformedCookieResponse.body.message).toBeUndefined();
    expect(malformedCookieResponse.headers['set-cookie']).toBeUndefined();

    // Failed logout requests must not revoke the valid session.
    const sessionBeforeValidLogout = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(sessionBeforeValidLogout).not.toBeNull();
    expect(sessionBeforeValidLogout?.revokedAt).toBeNull();
    expect(sessionBeforeValidLogout?.revocationReason).toBeNull();

    // The original cookie and CSRF token must still allow a valid logout.
    const validLogoutResponse = await request(app!.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    expect(validLogoutResponse.body).toEqual({
      message: 'Logged out successfully.',
    });

    const setCookies = validLogoutResponse.headers['set-cookie'];
    const clearedCookie = Array.isArray(setCookies)
      ? setCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token=;'),
        )
      : undefined;

    expect(clearedCookie).toBeDefined();

    const revokedSession = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(revokedSession?.revokedAt).toBeInstanceOf(Date);
    expect(revokedSession?.revocationReason).toBe('LOGOUT');
  });

  it('rejects missing or mismatched CSRF tokens without logging out a valid session', async () => {
    const email = `logout-csrf-${randomUUID()}@example.com`;
    const password = 'Logout-CSRF-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    expect(loginResponse.body).not.toHaveProperty('refreshToken');

    const loginSetCookies = loginResponse.headers['set-cookie'];
    const initialSetCookie = Array.isArray(loginSetCookies)
      ? loginSetCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token='),
        )
      : undefined;

    if (!initialSetCookie) {
      throw new Error('Login did not set a refresh-token cookie');
    }

    const cookiePair = initialSetCookie.split(';')[0];
    if (!cookiePair) {
      throw new Error('Could not extract the refresh-token cookie');
    }

    const csrfToken = loginResponse.body.csrfToken as string;

    // A missing CSRF header must be rejected and must not clear the cookie.
    const missingCsrfResponse = await request(app!.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookiePair)
      .expect(401);

    expect(missingCsrfResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(missingCsrfResponse.body.message).toBeUndefined();
    expect(missingCsrfResponse.headers['set-cookie']).toBeUndefined();

    // A well-formed but mismatched CSRF token must also be rejected.
    const mismatchedCsrfResponse = await request(app!.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', 'A'.repeat(43))
      .expect(401);

    expect(mismatchedCsrfResponse.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(mismatchedCsrfResponse.body.message).toBeUndefined();
    expect(mismatchedCsrfResponse.headers['set-cookie']).toBeUndefined();

    // Neither failed request should revoke the active session.
    const sessionBeforeValidLogout = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(sessionBeforeValidLogout).not.toBeNull();
    expect(sessionBeforeValidLogout?.revokedAt).toBeNull();
    expect(sessionBeforeValidLogout?.revocationReason).toBeNull();

    // The matching CSRF token must still permit logout.
    const logoutResponse = await request(app!.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    expect(logoutResponse.body).toEqual({
      message: 'Logged out successfully.',
    });
    expect(logoutResponse.body).not.toHaveProperty('refreshToken');
    expect(logoutResponse.headers['cache-control']).toBe('no-store');

    const logoutSetCookies = logoutResponse.headers['set-cookie'];
    const clearedCookie = Array.isArray(logoutSetCookies)
      ? logoutSetCookies.find((cookie: string) =>
          cookie.startsWith('refresh_token=;'),
        )
      : undefined;

    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('SameSite=Lax');
    expect(clearedCookie).toContain('Path=/auth');

    const revokedSession = await prisma.authSession.findFirst({
      where: { userId: user.id },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(revokedSession).not.toBeNull();
    expect(revokedSession?.revokedAt).toBeInstanceOf(Date);
    expect(revokedSession?.revocationReason).toBe('LOGOUT');

    // The old refresh token must not issue another access token after logout.
    const refreshAfterLogout = await request(app!.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookiePair)
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    expect(refreshAfterLogout.body).toMatchObject({
      code: 'IDENTITY.INVALID_REFRESH_TOKEN',
      category: 'authentication',
    });
    expect(refreshAfterLogout.body.message).toBeUndefined();
  });

  it('rejects an incorrect password with a safe 401 response', async () => {
    const email = `login-wrong-password-${randomUUID()}@example.com`;

    await createUser(email, 'Correct-E2E-Password-123!', 'ACTIVE', new Date());

    const response = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({
        email,
        password: 'Wrong-E2E-Password-123!',
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_CREDENTIALS',
      category: 'authentication',
    });

    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.message).toBeUndefined();
  });

  it('rejects an email address that does not exist', async () => {
    const response = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({
        email: `login-missing-${randomUUID()}@example.com`,
        password: 'Some-E2E-Password-123!',
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_CREDENTIALS',
      category: 'authentication',
    });

    expect(response.body.accessToken).toBeUndefined();
  });

  it('rejects a pending user whose email has not been verified', async () => {
    const email = `login-pending-${randomUUID()}@example.com`;
    const password = 'Pending-E2E-Password-123!';

    await createUser(email, password, 'PENDING', null);

    const response = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_CREDENTIALS',
      category: 'authentication',
    });

    expect(response.body.accessToken).toBeUndefined();
  });

  it('rejects a suspended user even when the password is correct', async () => {
    const email = `login-suspended-${randomUUID()}@example.com`;
    const password = 'Suspended-E2E-Password-123!';

    await createUser(email, password, 'SUSPENDED', new Date());

    const response = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.INVALID_CREDENTIALS',
      category: 'authentication',
    });

    expect(response.body.accessToken).toBeUndefined();
  });

  it('rejects GET /auth/me when the bearer token is missing', async () => {
    await request(app!.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects GET /auth/me when the bearer token is invalid', async () => {
    await request(app!.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .expect(401);
  });

  it('returns the authenticated user ID for a valid bearer token', async () => {
    const email = `auth-me-${randomUUID()}@example.com`;
    const password = 'Auth-Me-E2E-Password-123!';

    const user = await createUser(email, password, 'ACTIVE', new Date());

    const loginResponse = await request(app!.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(200);

    const response = await request(app!.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      userId: user.id,
    });
  });
});
