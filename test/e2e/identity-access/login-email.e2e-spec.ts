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
import { EMAIL_VERIFICATION_SENDER } from '../../../src/contexts/identity-access/application/ports/email-verification-sender.port.js';

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
    throw new Error(
      'Refusing to run E2E tests against an unexpected database',
    );
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

  const emailSenderMock = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
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
      .overrideProvider(EMAIL_VERIFICATION_SENDER)
      .useValue(emailSenderMock)
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

    emailSenderMock.sendVerificationEmail.mockClear();
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

    const user = await createUser(
      email,
      password,
      'ACTIVE',
      emailVerifiedAt,
    );

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


  it('rotates a refresh token and revokes the session when the old token is reused', async () => {
    const email = `refresh-rotation-${randomUUID()}@example.com`;
    const password = 'Refresh-E2E-Password-123!';

    const user = await createUser(
      email,
      password,
      'ACTIVE',
      new Date(),
    );

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
      throw new Error('Refresh response did not rotate the refresh-token cookie');
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

  it('rejects an incorrect password with a safe 401 response', async () => {
    const email = `login-wrong-password-${randomUUID()}@example.com`;

    await createUser(
      email,
      'Correct-E2E-Password-123!',
      'ACTIVE',
      new Date(),
    );

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

    await createUser(
      email,
      password,
      'SUSPENDED',
      new Date(),
    );

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
    await request(app!.getHttpServer())
      .get('/auth/me')
      .expect(401);
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

    const user = await createUser(
      email,
      password,
      'ACTIVE',
      new Date(),
    );

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
