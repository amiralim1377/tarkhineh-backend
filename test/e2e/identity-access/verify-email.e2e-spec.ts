import 'dotenv/config';

import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
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

import { AppModule } from '../../../src/app.module.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { EMAIL_VERIFICATION_SENDER } from '../../../src/contexts/identity-access/application/ports/email-verification-sender.port.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error(
      'DATABASE_URL must be configured for E2E tests',
    );
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(
    url.pathname.replace(/^\/+/, ''),
  );

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

describe('POST /auth/verify-email (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;

  const testEmails = new Set<string>();

  const emailSender = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    // Force E2E requests to use the isolated test database.
    process.env.DATABASE_URL = createTestDatabaseUrl();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_VERIFICATION_SENDER)
      .useValue(emailSender)
      .compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
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

    emailSender.sendVerificationEmail.mockClear();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createPendingUser(): Promise<{
    email: string;
    rawToken: string;
    tokenHash: string;
  }> {
    const email = `verify-e2e-${randomUUID()}@example.com`;
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256')
      .update(rawToken)
      .digest('hex');

    testEmails.add(email);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'e2e-test-password-hash',
        status: 'PENDING',
      },
      select: {
        id: true,
      },
    });

    await prisma.emailVerificationChallenge.create({
      data: {
        userId: user.id,
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return { email, rawToken, tokenHash };
  }

  it('activates a pending user when a valid token is submitted', async () => {
    const { email, rawToken, tokenHash } =
      await createPendingUser();

    const response = await request(app!.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: rawToken })
      .expect(200);

    expect(response.body).toMatchObject({
      message: 'Email verified successfully.',
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        status: true,
        emailVerifiedAt: true,
      },
    });

    expect(user).toMatchObject({
      status: 'ACTIVE',
      emailVerifiedAt: expect.any(Date),
    });

    const challenge =
      await prisma.emailVerificationChallenge.findUnique({
        where: { tokenHash },
        select: { consumedAt: true },
      });

    expect(challenge?.consumedAt).toBeInstanceOf(Date);
  });

  it('rejects a token that has already been used', async () => {
    const { rawToken } = await createPendingUser();

    await request(app!.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: rawToken })
      .expect(200);

    const response = await request(app!.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: rawToken })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'IDENTITY.EMAIL_VERIFICATION_TOKEN_INVALID',
    });
  });
});
