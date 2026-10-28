import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { Argon2PasswordHasher } from '../../../src/contexts/identity-access/infrastructure/security/argon2-password-hasher.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBullMqPrefix = process.env.BULLMQ_PREFIX;
const originalRateLimitKeyPrefix = process.env.RATE_LIMIT_KEY_PREFIX;
const originalEncryptionKey = process.env.OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY;

const testBullMqPrefix = `tarkhineh-e2e-${randomUUID()}`;
const testRateLimitKeyPrefix = `tarkhineh-e2e-rate-limit-${randomUUID()}`;

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

/**
 * Deletes keys belonging exclusively to this E2E suite.
 * The UUID-based prefixes prevent cleanup from targeting application queues.
 */
async function clearTestRedisNamespace(prefix: string): Promise<void> {
  if (prefix !== testBullMqPrefix && prefix !== testRateLimitKeyPrefix) {
    throw new Error('Refusing to clean an unrecognized E2E Redis namespace.');
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

describe('Forgot password flow (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;

  const testEmails = new Set<string>();

  beforeAll(async () => {
    process.env.DATABASE_URL = createTestDatabaseUrl(originalDatabaseUrl);

    // Isolate BullMQ queues and HTTP rate-limit counters for this test suite.
    process.env.BULLMQ_PREFIX = testBullMqPrefix;
    process.env.RATE_LIMIT_KEY_PREFIX = testRateLimitKeyPrefix;

    // Provide a deterministic encryption key when the test environment lacks one.
    if (!process.env.OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY) {
      process.env.OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY = Buffer.alloc(
        32,
        'a',
      ).toString('base64');
    }

    // Import after test-specific environment variables have been set.
    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
      // Each test gets a fresh rate-limit window.
      await clearTestRedisNamespace(testRateLimitKeyPrefix);
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      try {
        // Close the application before removing its BullMQ keys.
        await clearTestRedisNamespace(testBullMqPrefix);
      } finally {
        try {
          await clearTestRedisNamespace(testRateLimitKeyPrefix);
        } finally {
          restoreEnvironmentVariable('DATABASE_URL', originalDatabaseUrl);
          restoreEnvironmentVariable('BULLMQ_PREFIX', originalBullMqPrefix);
          restoreEnvironmentVariable(
            'RATE_LIMIT_KEY_PREFIX',
            originalRateLimitKeyPrefix,
          );
          restoreEnvironmentVariable(
            'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY',
            originalEncryptionKey,
          );
        }
      }
    }
  });

  it('should return 200 and success message when requesting password reset for an existing user', async () => {
    const email = `test-forgot-${randomUUID()}@example.com`;
    testEmails.add(email);

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash('secure-password-123');

    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        emailVerifiedAt: new Date(),
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const response = await request(app!.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message:
        'If that email address is in our database, we will send you an email to reset your password.',
    });

    const challenge = await prisma.passwordResetChallenge.findFirst({
      where: { userId: user.id },
    });

    expect(challenge).not.toBeNull();
    expect(challenge!.email).toBe(email);
    expect(challenge!.consumedAt).toBeNull();
    expect(challenge!.invalidatedAt).toBeNull();

    const emailMessage = await prisma.outboundEmailMessage.findFirst({
      where: {
        aggregateType: 'PasswordResetChallenge',
        aggregateId: challenge!.id,
      },
    });

    expect(emailMessage).not.toBeNull();
    expect(emailMessage!.lane).toBe('TRANSACTIONAL');
    expect(emailMessage!.status).toBe('PENDING');
  });

  it('should return the exact same 200 response when the user does not exist (Zero Enumeration)', async () => {
    const unknownEmail = `does-not-exist-${randomUUID()}@example.com`;

    const response = await request(app!.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: unknownEmail });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message:
        'If that email address is in our database, we will send you an email to reset your password.',
    });

    const challengeCount = await prisma.passwordResetChallenge.count({
      where: { email: unknownEmail },
    });

    expect(challengeCount).toBe(0);
  });
});
