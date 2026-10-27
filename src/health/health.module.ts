import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RateLimitStorageModule } from '../shared/infrastructure/rate-limiting/rate-limit-storage.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [PrismaModule, RateLimitStorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
