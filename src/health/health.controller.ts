import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { Auth } from '../contexts/identity-access/presentation/http/auth/auth.decorator.js';
import { AuthType } from '../contexts/identity-access/presentation/http/auth/auth-type.enum.js';
import { DependencyUnavailableError } from '../shared/application/errors/dependency-unavailable.error.js';
import { normalizePrismaError } from '../prisma/errors/prisma-error-translator.js';

import { DatabaseReadinessFailedError } from './errors/database-readiness-failed.error.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Auth(AuthType.None)
  @Get('live')
  liveness() {
    return {
      status: 'ok',
    };
  }

  @Auth(AuthType.None)
  @Get('ready')
  readiness() {
    return this.checkDatabase();
  }

  @Auth(AuthType.None)
  @Get()
  check() {
    return this.checkDatabase();
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'up',
      };
    } catch (error: unknown) {
      const normalizedError = normalizePrismaError(error);

      if (normalizedError instanceof DependencyUnavailableError) {
        throw normalizedError;
      }

      throw new DatabaseReadinessFailedError(error);
    }
  }
}
