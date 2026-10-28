import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { Controller, Get, Injectable, type CanActivate } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RATE_LIMIT_STORAGE_READINESS } from '../../../src/shared/application/ports/rate-limit-storage-readiness.port.js';
import type { RateLimitStorageReadiness } from '../../../src/shared/application/ports/rate-limit-storage-readiness.port.js';
import { GlobalHttpExceptionFilter } from '../../../src/shared/presentation/http/global-http-exception.filter.js';
import { RateLimitingModule } from '../../../src/shared/infrastructure/rate-limiting/rate-limiting.module.js';

const testRateLimitPrefix = `tarkhineh:rate-limit:guard-test:${randomUUID()}`;

const integrationSuite =
  process.env.RATE_LIMIT_REDIS_INTEGRATION === 'true'
    ? describe
    : describe.skip;

async function clearTestRateLimitKeys(prefix: string): Promise<void> {
  const allowedPrefix = 'tarkhineh:rate-limit:guard-test:';

  // Never allow cleanup outside this test's Redis namespace.
  if (!prefix.startsWith(allowedPrefix)) {
    throw new Error(
      `Refusing to clear Redis keys outside the test namespace: ${prefix}`,
    );
  }

  const redis = new Redis({
    host: process.env.RATE_LIMIT_TEST_REDIS_HOST || '127.0.0.1',
    port: Number(process.env.RATE_LIMIT_TEST_REDIS_PORT || '6379'),
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

@Controller('rate-limit-probe')
class RateLimitProbeController {
  @Get()
  @Throttle({
    default: {
      limit: 2,
      ttl: 60_000,
      blockDuration: 60_000,
    },
  })
  getProbe() {
    return { status: 'ok' };
  }
}

@Injectable()
class CountingAuthenticationGuard implements CanActivate {
  static calls = 0;

  canActivate(): boolean {
    CountingAuthenticationGuard.calls += 1;
    return true;
  }
}

integrationSuite('Rate-limit HTTP guard ordering', () => {
  let app: Awaited<ReturnType<typeof createTestApplication>> | undefined;

  async function createTestApplication() {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              REDIS_HOST: process.env.RATE_LIMIT_TEST_REDIS_HOST || '127.0.0.1',
              REDIS_PORT: Number(
                process.env.RATE_LIMIT_TEST_REDIS_PORT || '6379',
              ),
              RATE_LIMIT_KEY_PREFIX: testRateLimitPrefix,
            }),
          ],
        }),
        RateLimitingModule,
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent',
            autoLogging: false,
          },
        }),
      ],
      controllers: [RateLimitProbeController],
      providers: [
        // Preserve the global guard order being tested.
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
        {
          provide: APP_GUARD,
          useClass: CountingAuthenticationGuard,
        },
        {
          provide: APP_FILTER,
          useClass: GlobalHttpExceptionFilter,
        },
      ],
    }).compile();

    const application = moduleRef.createNestApplication();
    await application.init();

    return application;
  }

  async function waitForReadiness(
    readiness: RateLimitStorageReadiness,
  ): Promise<void> {
    const deadline = Date.now() + 5_000;
    let lastError: unknown;

    while (Date.now() < deadline) {
      try {
        await readiness.checkReadiness();
        return;
      } catch (error: unknown) {
        lastError = error;

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 25);
        });
      }
    }

    throw new Error(
      'Redis did not become ready for the HTTP integration test.',
      { cause: lastError },
    );
  }

  beforeAll(async () => {
    app = await createTestApplication();

    const readiness = app.get<RateLimitStorageReadiness>(
      RATE_LIMIT_STORAGE_READINESS,
    );

    await waitForReadiness(readiness);
  });

  beforeEach(() => {
    CountingAuthenticationGuard.calls = 0;
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      app = undefined;

      // Remove only keys created by this test run.
      await clearTestRateLimitKeys(testRateLimitPrefix);
    }
  });

  it('returns 429 before invoking the subsequent authentication guard', async () => {
    if (!app) {
      throw new Error('Test application was not initialized.');
    }

    const server = app.getHttpServer();

    await request(server).get('/rate-limit-probe').expect(200);

    await request(server).get('/rate-limit-probe').expect(200);

    expect(CountingAuthenticationGuard.calls).toBe(2);

    const thirdResponse = await request(server)
      .get('/rate-limit-probe')
      .expect(429);

    expect(thirdResponse.body).toMatchObject({
      code: 'COMMON.RATE_LIMITED',
      category: 'rate_limited',
      status: 429,
    });

    expect(thirdResponse.headers['retry-after']).toBeTruthy();

    expect(CountingAuthenticationGuard.calls).toBe(2);

    await request(server).get('/rate-limit-probe').expect(429);

    expect(CountingAuthenticationGuard.calls).toBe(2);
  });
});
