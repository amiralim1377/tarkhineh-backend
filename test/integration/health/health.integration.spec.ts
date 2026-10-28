import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appCreate } from '../../../src/app.create.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { GlobalHttpExceptionFilter } from '../../../src/shared/presentation/http/global-http-exception.filter.js';
import { HealthController } from '../../../src/health/health.controller.js';
import { RateLimitStoreUnavailableError } from '../../../src/shared/application/errors/rate-limit-store-unavailable.error.js';
import { RATE_LIMIT_STORAGE_READINESS } from '../../../src/shared/application/ports/rate-limit-storage-readiness.port.js';

async function createHealthApp(
  queryRaw: ReturnType<typeof vi.fn>,
  checkReadiness: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: {
          level: 'silent',
          autoLogging: false,
        },
      }),
    ],
    controllers: [HealthController],
    providers: [
      {
        provide: PrismaService,
        useValue: {
          $queryRaw: queryRaw,
        },
      },
      {
        provide: RATE_LIMIT_STORAGE_READINESS,
        useValue: { checkReadiness },
      },
      {
        provide: APP_FILTER,
        useClass: GlobalHttpExceptionFilter,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  appCreate(app);

  await app.init();

  return app;
}

describe('Health endpoints integration', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns a safe 503 when database readiness fails', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'postgres://private-user:private-password@db.internal.example/database',
        ),
      );

    app = await createHealthApp(queryRaw);

    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'COMMON.DEPENDENCY_UNAVAILABLE',
      category: 'dependency_unavailable',
    });

    expect(response.body.requestId).toBeTruthy();

    const body = JSON.stringify(response.body);

    expect(body).not.toContain('private-password');
    expect(body).not.toContain('db.internal.example');
    expect(body).not.toContain('postgres://');

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps liveness healthy without querying the database', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(new Error('Synthetic database failure'));

    app = await createHealthApp(queryRaw);

    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
    });

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('preserves the legacy health endpoint as a readiness check', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(new Error('Synthetic database failure'));

    app = await createHealthApp(queryRaw);

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'COMMON.DEPENDENCY_UNAVAILABLE',
      category: 'dependency_unavailable',
    });
  });

  it('returns a safe 503 when rate-limit storage readiness fails', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ result: 1 }]);
    const checkReadiness = vi.fn().mockRejectedValue(
      new RateLimitStoreUnavailableError(
        'readiness-check',
        new Error('redis://private-user:private-password@redis.internal:6379'),
      ),
    );

    app = await createHealthApp(queryRaw, checkReadiness);

    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'COMMON.DEPENDENCY_UNAVAILABLE',
      category: 'dependency_unavailable',
      status: 503,
    });

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('private-password');
    expect(body).not.toContain('redis.internal');
    expect(body).not.toContain('redis://');

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(checkReadiness).toHaveBeenCalledTimes(1);
  });
});
