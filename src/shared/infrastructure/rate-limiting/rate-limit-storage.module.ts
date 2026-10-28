import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RATE_LIMIT_STORAGE_READINESS } from '../../application/ports/rate-limit-storage-readiness.port.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

/**
 * Infrastructure-level adapter token consumed by the Nest throttler module.
 * Consumers depend on the storage contract, not on the Redis implementation.
 */
export const THROTTLER_STORAGE_ADAPTER = Symbol('THROTTLER_STORAGE_ADAPTER');

@Module({
  imports: [ConfigModule],
  providers: [
    RedisThrottlerStorage,
    {
      provide: RATE_LIMIT_STORAGE_READINESS,
      useExisting: RedisThrottlerStorage,
    },
    {
      provide: THROTTLER_STORAGE_ADAPTER,
      useExisting: RedisThrottlerStorage,
    },
  ],
  exports: [RATE_LIMIT_STORAGE_READINESS, THROTTLER_STORAGE_ADAPTER],
})
export class RateLimitStorageModule {}
