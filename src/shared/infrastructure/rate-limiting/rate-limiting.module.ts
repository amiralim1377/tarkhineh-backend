import { Module } from '@nestjs/common';
import { ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';

import { RATE_LIMIT_POLICIES } from '../../../config/rate-limit.policies.js';
import {
  RateLimitStorageModule,
  THROTTLER_STORAGE_ADAPTER,
} from './rate-limit-storage.module.js';

@Module({
  imports: [
    RateLimitStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [THROTTLER_STORAGE_ADAPTER],
      useFactory: (storage: ThrottlerStorage) => ({
        storage,
        throttlers: [RATE_LIMIT_POLICIES.default],
      }),
    }),
  ],
})
export class RateLimitingModule {}
