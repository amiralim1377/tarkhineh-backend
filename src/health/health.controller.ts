import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  RATE_LIMIT_STORAGE_READINESS,
  type RateLimitStorageReadiness,
} from '../shared/application/ports/rate-limit-storage-readiness.port.js';
import { Auth } from '../contexts/identity-access/presentation/http/auth/decorators/auth.decorator.js';
import { AuthType } from '../contexts/identity-access/presentation/http/auth/contracts/auth-type.enum.js';
import { DependencyUnavailableError } from '../shared/application/errors/dependency-unavailable.error.js';
import { normalizePrismaError } from '../prisma/errors/prisma-error-translator.js';

import { DatabaseReadinessFailedError } from './errors/database-readiness-failed.error.js';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RATE_LIMIT_STORAGE_READINESS)
    private readonly rateLimitStorageReadiness: RateLimitStorageReadiness,
  ) {}

  @Auth(AuthType.None)
  @Get('live')
  liveness() {
    return {
      status: 'ok',
    };
  }

  @Auth(AuthType.None)
  @Get('ready')
  async readiness() {
    await this.checkDatabase();
    await this.rateLimitStorageReadiness.checkReadiness();

    return {
      status: 'ok',
      database: 'up',
      rateLimitStore: 'up',
    };
  }

  @Auth(AuthType.None)
  @Get()
  check() {
    return this.readiness();
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error: unknown) {
      const normalizedError = normalizePrismaError(error);

      if (normalizedError instanceof DependencyUnavailableError) {
        throw normalizedError;
      }

      throw new DatabaseReadinessFailedError(error);
    }
  }
}
