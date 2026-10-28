import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testRateLimitPrefix = `tarkhineh:rate-limit:app-integration:${randomUUID()}`;

const integrationSuite =
  process.env.RATE_LIMIT_REDIS_INTEGRATION === 'true'
    ? describe
    : describe.skip;

async function clearTestRateLimitKeys(prefix: string): Promise<void> {
  const allowedPrefix = 'tarkhineh:rate-limit:app-integration:';

  // Refuse to delete keys outside this test's Redis namespace.
  if (!prefix.startsWith(allowedPrefix)) {
    throw new Error(
      `Refusing to clear Redis keys outside the test namespace: ${prefix}`,
    );
  }

  const redis = new Redis({
    host:
      process.env.RATE_LIMIT_TEST_REDIS_HOST ||
      process.env.REDIS_HOST ||
      '127.0.0.1',
    port: Number(
      process.env.RATE_LIMIT_TEST_REDIS_PORT ||
        process.env.REDIS_PORT ||
        '6379',
    ),
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();

    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefix}:*`,
        'COUNT',
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  } finally {
    if (redis.status === 'ready') {
      await redis.quit();
    } else {
      redis.disconnect();
    }
  }
}

integrationSuite('AppModule rate-limit guard ordering', () => {
  let app: INestApplication | undefined;

  const originalPrefix = process.env.RATE_LIMIT_KEY_PREFIX;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeAll(async () => {
    // Give this test run its own isolated Redis namespace.
    process.env.RATE_LIMIT_KEY_PREFIX = testRateLimitPrefix;
    process.env.LOG_LEVEL = 'silent';

    // Import AppModule after setting the test configuration.
    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    try {
      // Close the application before removing its Redis keys.
      await app?.close();
    } finally {
      try {
        await clearTestRateLimitKeys(testRateLimitPrefix);
      } finally {
        // Restore the original environment even if cleanup fails.
        if (originalPrefix === undefined) {
          delete process.env.RATE_LIMIT_KEY_PREFIX;
        } else {
          process.env.RATE_LIMIT_KEY_PREFIX = originalPrefix;
        }

        if (originalLogLevel === undefined) {
          delete process.env.LOG_LEVEL;
        } else {
          process.env.LOG_LEVEL = originalLogLevel;
        }
      }
    }
  });

  it('applies global rate limiting before authentication on the real AppModule', async () => {
    if (!app) {
      throw new Error('AppModule test application was not initialized.');
    }

    const server = app.getHttpServer();

    for (let index = 0; index < 120; index += 1) {
      await request(server).get('/auth/me').expect(401);
    }

    const response = await request(server).get('/auth/me').expect(429);

    expect(response.body).toMatchObject({
      code: 'COMMON.RATE_LIMITED',
      category: 'rate_limited',
      status: 429,
    });

    expect(response.headers['retry-after']).toBeTruthy();
  });
});
