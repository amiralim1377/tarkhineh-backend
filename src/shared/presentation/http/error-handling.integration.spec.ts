import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsEmail, MinLength } from 'class-validator';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appCreate } from '../../../app.create.js';
import { ApplicationError } from '../../application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { GlobalHttpExceptionFilter } from './global-http-exception.filter.js';
import { DependencyUnavailableError } from '../../application/errors/dependency-unavailable.error.js';

class IntegrationTestDto {
  @IsEmail()
  email!: string;

  @MinLength(12, {
    context: {
      publicParams: { min: 12 },
    },
  })
  password!: string;
}

class SensitiveApplicationError extends ApplicationError {
  readonly code = 'TEST.SENSITIVE_FAILURE';
  override readonly category = ERROR_CATEGORY.BUSINESS_RULE;

  constructor() {
    super('Internal diagnostic that must not be public', {
      metadata: {
        internalHost: 'db.internal.example',
      },
    });
  }
}

@Controller('integration-test')
class ErrorHandlingTestController {
  @Post('validation')
  validate(@Body() _dto: IntegrationTestDto) {
    return { ok: true };
  }

  @Get('known-error')
  throwKnownError(): never {
    throw new SensitiveApplicationError();
  }

  @Get('unexpected-error')
  throwUnexpectedError(): never {
    throw new Error(
      'postgres://private-user:private-password@db.internal.example/database',
    );
  }

  @Get('dependency-unavailable')
  throwDependencyUnavailable(): never {
    throw new DependencyUnavailableError(
      'P1001',
      new Error(
        'postgres://private-user:private-password@db.internal.example/database',
      ),
    );
  }
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'silent',
        autoLogging: false,
      },
    }),
  ],
  controllers: [ErrorHandlingTestController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
  ],
})
class ErrorHandlingTestModule {}

describe('Global error handling integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ErrorHandlingTestModule],
    }).compile();

    app = moduleRef.createNestApplication();

    appCreate(app);

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns stable codes and safe params for invalid DTO input', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration-test/validation')
      .send({
        email: 'not-an-email',
        password: 'short',
        unexpected: 'private-input',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'COMMON.VALIDATION_FAILED',
      category: 'validation',
      fields: expect.arrayContaining([
        {
          field: 'email',
          code: 'VALIDATION.IS_EMAIL',
        },
        {
          field: 'password',
          code: 'VALIDATION.MIN_LENGTH',
          params: { min: 12 },
        },
        {
          field: '$',
          code: 'VALIDATION.UNKNOWN_PROPERTY',
        },
      ]),
    });

    expect(response.body.requestId).toBeTruthy();

    const body = JSON.stringify(response.body);

    expect(body).not.toContain('not-an-email');
    expect(body).not.toContain('private-input');
    expect(body).not.toContain('must be an email');
  });

  it('returns a safe 404 for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/route-that-does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'COMMON.ROUTE_NOT_FOUND',
      category: 'not_found',
    });

    expect(response.body.requestId).toBeTruthy();
    expect(response.body.message).toBeUndefined();
  });

  it('does not expose metadata or internal messages from known errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/integration-test/known-error')
      .expect(422);

    expect(response.body).toMatchObject({
      code: 'TEST.SENSITIVE_FAILURE',
      category: ERROR_CATEGORY.BUSINESS_RULE,
    });

    const body = JSON.stringify(response.body);

    expect(body).not.toContain('Internal diagnostic');
    expect(body).not.toContain('db.internal.example');
    expect(response.body.requestId).toBeTruthy();
  });

  it('hides unexpected exception details from clients', async () => {
    const response = await request(app.getHttpServer())
      .get('/integration-test/unexpected-error')
      .expect(500);

    expect(response.body).toMatchObject({
      code: 'COMMON.INTERNAL_ERROR',
      category: 'internal',
    });

    const body = JSON.stringify(response.body);

    expect(body).not.toContain('private-password');
    expect(body).not.toContain('db.internal.example');
    expect(body).not.toContain('postgres://');
    expect(response.body.requestId).toBeTruthy();
  });

  it('returns a safe 503 when a dependency is unavailable', async () => {
    const response = await request(app.getHttpServer())
      .get('/integration-test/dependency-unavailable')
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'COMMON.DEPENDENCY_UNAVAILABLE',
      category: 'dependency_unavailable',
    });

    expect(response.body.requestId).toBeTruthy();

    const body = JSON.stringify(response.body);

    expect(body).not.toContain('P1001');
    expect(body).not.toContain('private-password');
    expect(body).not.toContain('db.internal.example');
    expect(body).not.toContain('postgres://');
  });
});
