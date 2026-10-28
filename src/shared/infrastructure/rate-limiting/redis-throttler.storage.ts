import { createHash } from 'node:crypto';

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

import {
  RateLimitStoreUnavailableError,
  type RateLimitStoreOperation,
} from '../../application/errors/rate-limit-store-unavailable.error.js';
import type { RateLimitStorageReadiness } from '../../application/ports/rate-limit-storage-readiness.port.js';

const CONNECTION_TIMEOUT_MS = 1_000;
const COMMAND_TIMEOUT_MS = 500;

/**
 * Fixed-window counter implemented atomically by Redis.
 *
 * When blockDuration is positive, the counter TTL is reset to the block
 * duration when the threshold is exceeded. The counter and block marker
 * therefore expire together, allowing a fresh window after the cooldown.
 *
 * All keys use the same Redis hash tag so the two-key script stays in one
 * hash slot on Redis Cluster-compatible key layouts.
 */
const INCREMENT_SCRIPT = `
local ttlMs = math.max(1, tonumber(ARGV[1]))
local limit = math.max(1, math.floor(tonumber(ARGV[2])))
local blockDurationMs = math.max(0, tonumber(ARGV[3]))

local blockedCount = redis.call('GET', KEYS[2])

if blockedCount then
  local blockTtl = redis.call('PTTL', KEYS[2])

  if blockTtl > 0 then
    local windowTtl = redis.call('PTTL', KEYS[1])

    if windowTtl < 0 then
      windowTtl = 0
    end

    return {
      tonumber(blockedCount),
      math.ceil(windowTtl / 1000),
      1,
      math.ceil(blockTtl / 1000)
    }
  end

  redis.call('DEL', KEYS[2])
end

local currentHits = tonumber(redis.call('GET', KEYS[1]) or '0')
local currentTtl = redis.call('PTTL', KEYS[1])

if blockDurationMs <= 0 and currentHits >= limit then
  if currentTtl < 0 then
    currentTtl = ttlMs
  end

  return {
    currentHits + 1,
    math.ceil(currentTtl / 1000),
    1,
    math.ceil(currentTtl / 1000)
  }
end

local hits = redis.call('INCR', KEYS[1])

if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ttlMs)
end

local windowTtl = redis.call('PTTL', KEYS[1])

if blockDurationMs > 0 and hits > limit then
  -- Expire the counter before the block key so it cannot outlive the block.
  redis.call('PEXPIRE', KEYS[1], blockDurationMs)
  redis.call('SET', KEYS[2], tostring(hits), 'PX', blockDurationMs)

  windowTtl = redis.call('PTTL', KEYS[1])
  local blockTtl = redis.call('PTTL', KEYS[2])

  return {
    hits,
    math.ceil(math.max(windowTtl, 0) / 1000),
    1,
    math.ceil(math.max(blockTtl, 0) / 1000)
  }
end

return {
  hits,
  math.ceil(math.max(windowTtl, 0) / 1000),
  0,
  0
}
`;

interface RedisThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

function parseStorageRecord(value: unknown): RedisThrottlerRecord {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('Unexpected Redis rate-limit response.');
  }

  const numbers = value.map((item: unknown) => {
    if (
      (typeof item !== 'number' && typeof item !== 'string') ||
      String(item).trim() === ''
    ) {
      throw new Error('Invalid Redis rate-limit response.');
    }

    const number = Number(item);

    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error('Invalid Redis rate-limit response.');
    }

    return number;
  });

  const [totalHits, timeToExpire, blocked, timeToBlockExpire] = numbers;

  if (blocked !== 0 && blocked !== 1) {
    throw new Error('Invalid Redis rate-limit blocked state.');
  }

  return {
    totalHits,
    timeToExpire,
    isBlocked: blocked === 1,
    timeToBlockExpire,
  };
}

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, RateLimitStorageReadiness, OnModuleDestroy
{
  private readonly redis: Redis;
  private readonly keyPrefix: string;

  constructor(configService: ConfigService) {
    this.keyPrefix = configService.getOrThrow<string>('RATE_LIMIT_KEY_PREFIX');

    this.redis = new Redis({
      host: configService.getOrThrow<string>('REDIS_HOST'),
      port: Number(configService.getOrThrow<number | string>('REDIS_PORT')),
      connectTimeout: CONNECTION_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RedisThrottlerRecord> {
    if (
      !Number.isFinite(ttl) ||
      ttl <= 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      !Number.isFinite(blockDuration) ||
      blockDuration < 0
    ) {
      throw new RangeError('Invalid rate-limit policy configuration.');
    }

    if (this.redis.status !== 'ready') {
      throw this.createUnavailableError('increment');
    }

    const scopeHash = createHash('sha256')
      .update(key)
      .update('\0')
      .update(throttlerName)
      .digest('hex');

    const scopedKey = `${this.keyPrefix}:{${scopeHash}}`;

    try {
      const result: unknown = await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${scopedKey}:hits`,
        `${scopedKey}:blocked`,
        Math.ceil(ttl),
        limit,
        Math.ceil(blockDuration),
      );

      return parseStorageRecord(result);
    } catch (cause: unknown) {
      throw this.createUnavailableError('increment', cause);
    }
  }

  async checkReadiness(): Promise<void> {
    if (this.redis.status !== 'ready') {
      throw this.createUnavailableError('readiness-check');
    }

    try {
      const response = await this.redis.ping();

      if (response !== 'PONG') {
        throw new Error('Unexpected Redis readiness response.');
      }
    } catch (cause: unknown) {
      throw this.createUnavailableError('readiness-check', cause);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'ready') {
      this.redis.disconnect();
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private createUnavailableError(
    operation: RateLimitStoreOperation,
    cause?: unknown,
  ): RateLimitStoreUnavailableError {
    return new RateLimitStoreUnavailableError(operation, cause);
  }
}
