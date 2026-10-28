import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitStoreUnavailableError } from '../../application/errors/rate-limit-store-unavailable.error.js';
import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const redisMocks = vi.hoisted(() => ({
  status: 'ready' as string,
  eval: vi.fn(),
  ping: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  options: undefined as Record<string, unknown> | undefined,
}));

vi.mock('ioredis', () => {
  class MockRedis {
    constructor(options: Record<string, unknown>) {
      redisMocks.options = options;
    }

    get status(): string {
      return redisMocks.status;
    }

    eval(...args: unknown[]) {
      return redisMocks.eval(...args);
    }

    ping() {
      return redisMocks.ping();
    }

    quit() {
      return redisMocks.quit();
    }

    disconnect() {
      return redisMocks.disconnect();
    }

    on(event: string, listener: (...args: unknown[]) => void) {
      redisMocks.on(event, listener);
      return this;
    }
  }

  return { Redis: MockRedis };
});

const configValues = {
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: 6379,
  RATE_LIMIT_KEY_PREFIX: 'tarkhineh:rate-limit:v1',
};

function createStorage(): RedisThrottlerStorage {
  const configService = {
    getOrThrow: (key: keyof typeof configValues) => configValues[key],
  } as unknown as ConfigService;

  return new RedisThrottlerStorage(configService);
}

async function increment(storage: RedisThrottlerStorage) {
  return storage.increment(
    'route:possibly-sensitive@example.test',
    60_000,
    10,
    60_000,
    'default',
  );
}

describe('RedisThrottlerStorage', () => {
  beforeEach(() => {
    redisMocks.status = 'ready';
    redisMocks.eval.mockReset().mockResolvedValue([3, 60, 0, 0]);
    redisMocks.ping.mockReset().mockResolvedValue('PONG');
    redisMocks.quit.mockReset().mockResolvedValue('OK');
    redisMocks.disconnect.mockReset();
    redisMocks.on.mockReset();
    redisMocks.options = undefined;
  });

  it('configures bounded Redis commands and disables the offline queue', () => {
    createStorage();

    expect(redisMocks.options).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      connectTimeout: 1_000,
      commandTimeout: 500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    expect(redisMocks.options?.retryStrategy).toBeTypeOf('function');
  });

  it('uses an atomic Lua operation and privacy-safe namespaced keys', async () => {
    const storage = createStorage();

    await expect(increment(storage)).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const call = redisMocks.eval.mock.calls[0];

    expect(call?.[0]).toContain("redis.call('INCR', KEYS[1])");
    expect(call?.[1]).toBe(2);

    const hitsKey = String(call?.[2]);
    const blockedKey = String(call?.[3]);

    expect(hitsKey).toMatch(
      /^tarkhineh:rate-limit:v1:\{[a-f0-9]{64}\}:hits$/,
    );
    expect(blockedKey).toBe(hitsKey.replace(/:hits$/, ':blocked'));
    expect(hitsKey).not.toContain('possibly-sensitive@example.test');
    expect(call?.[4]).toBe(60_000);
    expect(call?.[5]).toBe(10);
    expect(call?.[6]).toBe(60_000);
  });

  it('maps a blocked Redis record to the throttler contract', async () => {
    redisMocks.eval.mockResolvedValueOnce([11, 30, 1, 15]);

    await expect(increment(createStorage())).resolves.toEqual({
      totalHits: 11,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 15,
    });
  });

  it('fails closed when Redis is not ready', async () => {
    redisMocks.status = 'connecting';

    const storage = createStorage();

    await expect(increment(storage)).rejects.toMatchObject({
      code: 'COMMON.DEPENDENCY_UNAVAILABLE',
      category: ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE,
      metadata: {
        dependency: 'redis',
        operation: 'increment',
      },
    });

    expect(redisMocks.eval).not.toHaveBeenCalled();
  });

  it('maps Redis command failures to a safe application error', async () => {
    const internalError = new Error(
      'redis://user:password@internal-host:6379',
    );
    redisMocks.eval.mockRejectedValueOnce(internalError);

    let caughtError: unknown;

    try {
      await increment(createStorage());
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(RateLimitStoreUnavailableError);

    if (!(caughtError instanceof RateLimitStoreUnavailableError)) {
      throw new Error('Expected RateLimitStoreUnavailableError.');
    }

    expect(caughtError.cause).toBe(internalError);
    expect(caughtError.message).not.toContain('password');
    expect(caughtError.metadata).toMatchObject({
      dependency: 'redis',
      operation: 'increment',
    });
  });

  it('reports readiness after a successful Redis PING', async () => {
    const storage = createStorage();

    await expect(storage.checkReadiness()).resolves.toBeUndefined();
    expect(redisMocks.ping).toHaveBeenCalledOnce();
  });

  it('fails readiness when Redis is unavailable', async () => {
    redisMocks.status = 'reconnecting';

    const storage = createStorage();

    await expect(storage.checkReadiness()).rejects.toMatchObject({
      category: ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE,
      metadata: {
        dependency: 'redis',
        operation: 'readiness-check',
      },
    });

    expect(redisMocks.ping).not.toHaveBeenCalled();
  });

  it('maps a failed readiness PING to a safe application error', async () => {
    redisMocks.ping.mockRejectedValueOnce(
      new Error('internal Redis diagnostic'),
    );

    let caughtError: unknown;

    try {
      await createStorage().checkReadiness();
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(RateLimitStoreUnavailableError);

    if (!(caughtError instanceof RateLimitStoreUnavailableError)) {
      throw new Error('Expected RateLimitStoreUnavailableError.');
    }

    expect(caughtError.message).not.toContain('internal Redis diagnostic');
  });

  it('gracefully quits a ready Redis connection', async () => {
    const storage = createStorage();

    await storage.onModuleDestroy();

    expect(redisMocks.quit).toHaveBeenCalledOnce();
    expect(redisMocks.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects immediately when Redis is not ready during shutdown', async () => {
    redisMocks.status = 'connecting';

    const storage = createStorage();

    await storage.onModuleDestroy();

    expect(redisMocks.disconnect).toHaveBeenCalledOnce();
    expect(redisMocks.quit).not.toHaveBeenCalled();
  });
});
