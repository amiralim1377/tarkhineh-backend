import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

const integrationSuite =
  process.env.RATE_LIMIT_REDIS_INTEGRATION === 'true'
    ? describe
    : describe.skip;

integrationSuite('AppModule rate-limit guard ordering', () => {
  let app: INestApplication | undefined;
  const originalPrefix = process.env.RATE_LIMIT_KEY_PREFIX;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeAll(async () => {
    // Isolate Redis keys from application and other test traffic.
    process.env.RATE_LIMIT_KEY_PREFIX =
      `tarkhineh:rate-limit:app-integration:${randomUUID()}`;
    process.env.LOG_LEVEL = 'silent';

    // Import only after the isolated configuration has been set.
    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
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
  });

  it('applies global rate limiting before authentication on the real AppModule', async () => {
    if (!app) {
      throw new Error('AppModule test application was not initialized.');
    }

    const server = app.getHttpServer();

    for (let index = 0; index < 120; index += 1) {
      await request(server).get('/auth/me').expect(401);
    }

    const response = await request(server)
      .get('/auth/me')
      .expect(429);

    expect(response.body).toMatchObject({
      code: 'COMMON.RATE_LIMITED',
      category: 'rate_limited',
      status: 429,
    });

    expect(response.headers['retry-after']).toBeTruthy();
  });
});
