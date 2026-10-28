import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBullMqPrefix = process.env.BULLMQ_PREFIX;
const originalRateLimitKeyPrefix = process.env.RATE_LIMIT_KEY_PREFIX;

const testBullMqPrefix = `tarkhineh-app-e2e-${randomUUID()}`;
const testRateLimitKeyPrefix =
  `tarkhineh-app-e2e-rate-limit-${randomUUID()}`;

function createTestDatabaseUrl(
  configuredUrl: string | undefined,
): string {
  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for E2E tests');
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

async function clearTestRedisNamespace(
  prefix: string,
): Promise<void> {
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

describe('AppController (e2e)', () => {
  let app: INestApplication | undefined;

  beforeEach(async () => {
    process.env.DATABASE_URL =
      createTestDatabaseUrl(originalDatabaseUrl);
    process.env.BULLMQ_PREFIX = testBullMqPrefix;
    process.env.RATE_LIMIT_KEY_PREFIX = testRateLimitKeyPrefix;

    // Import only after test-specific environment variables are set.
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    const appInstance = moduleFixture.createNestApplication();
    app = appInstance;
    await appInstance.init();
  });

  it('/ (GET)', async () => {
    if (!app) {
      throw new Error('E2E application was not initialized');
    }

    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    try {
      if (app) {
        await app.close();
        app = undefined;
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
});
