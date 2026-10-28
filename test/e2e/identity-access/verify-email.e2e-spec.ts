import 'dotenv/config';

import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
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

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { OUTBOUND_EMAIL_PROVIDER } from '../../../src/contexts/outbound-email/application/ports/outbound-email-provider.port.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBullMqPrefix = process.env.BULLMQ_PREFIX;
const originalRateLimitKeyPrefix = process.env.RATE_LIMIT_KEY_PREFIX;

const testBullMqPrefix = `tarkhineh-e2e-${randomUUID()}`;
const testRateLimitKeyPrefix =
  `tarkhineh-e2e-rate-limit-${randomUUID()}`;

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

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

async function clearTestRedisNamespace(prefix: string): Promise<void> {
  if (
    prefix !== testBullMqPrefix &&
    prefix !== testRateLimitKeyPrefix
  ) {
    throw new Error(
      'Refusing to clean an unrecognized E2E Redis namespace.',
    );
  }

  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    connectTimeout: 1_000,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();

    let cursor = '0';
    const pattern = `${prefix}:*`;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );

      for (let index = 0; index < keys.length; index += 100) {
        const batch = keys.slice(index, index + 100);

        if (batch.length > 0) {
          await redis.unlink(...batch);
        }
      }

      cursor = nextCursor;
    } while (cursor !== '0');
  } finally {
    if (redis.status === 'ready') {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    } else {
      redis.disconnect();
    }
  }
}

describe('POST /auth/verify-email (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;

  const testEmails = new Set<string>();

  const outboundEmailProviderMock = {
    send: vi.fn().mockResolvedValue({
      providerMessageId: 'e2e-provider-message-id',
    }),
  };

  beforeAll(async () => {
    // Force E2E requests to use the isolated test database.
    process.env.DATABASE_URL = createTestDatabaseUrl();
    process.env.BULLMQ_PREFIX = testBullMqPrefix;
    process.env.RATE_LIMIT_KEY_PREFIX = testRateLimitKeyPrefix;

    // Load AppModule only after test-specific configuration is set.
    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OUTBOUND_EMAIL_PROVIDER)
      .useValue(outboundEmailProviderMock)
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
    try {
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
    } finally {
      try {
        await clearTestRedisNamespace(testRateLimitKeyPrefix);
      } finally {
        outboundEmailProviderMock.send.mockClear();
      }
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      try {
        await clearTestRedisNamespace(testBullMqPrefix);
      } finally {
        try {
          await clearTestRedisNamespace(testRateLimitKeyPrefix);
        } finally {
          restoreEnvironmentVariable(
            'DATABASE_URL',
            originalDatabaseUrl,
          );
          restoreEnvironmentVariable(
            'BULLMQ_PREFIX',
            originalBullMqPrefix,
          );
          restoreEnvironmentVariable(
            'RATE_LIMIT_KEY_PREFIX',
            originalRateLimitKeyPrefix,
          );
        }
      }
    }
  });

  async function createPendingUser(): Promise<{
    email: string;
    rawToken: string;
    tokenHash: string;
  }> {
    const email = `verify-e2e-${randomUUID()}@example.com`;
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

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
    const { email, rawToken, tokenHash } = await createPendingUser();

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

    const challenge = await prisma.emailVerificationChallenge.findUnique({
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
