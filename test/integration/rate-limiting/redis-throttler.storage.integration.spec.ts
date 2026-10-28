import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RedisThrottlerStorage } from '../../../src/shared/infrastructure/rate-limiting/redis-throttler.storage.js';

const integrationSuite =
  process.env.RATE_LIMIT_REDIS_INTEGRATION === 'true'
    ? describe
    : describe.skip;

const RATE_LIMIT_TEST_PREFIX = 'tarkhineh:rate-limit:integration:';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const createdStorages = new Set<RedisThrottlerStorage>();
const createdPrefixes = new Set<string>();

function createStorage(
  keyPrefix = `${RATE_LIMIT_TEST_PREFIX}${randomUUID()}`,
): RedisThrottlerStorage {
  createdPrefixes.add(keyPrefix);

  const values: Record<string, string | number> = {
    REDIS_HOST: process.env.RATE_LIMIT_TEST_REDIS_HOST || '127.0.0.1',
    REDIS_PORT: Number(process.env.RATE_LIMIT_TEST_REDIS_PORT || '6379'),
    RATE_LIMIT_KEY_PREFIX: keyPrefix,
  };

  const configService = {
    getOrThrow: (key: string) => {
      const value = values[key];

      if (value === undefined) {
        throw new Error(`Missing test setting: ${key}`);
      }

      return value;
    },
  } as unknown as ConfigService;

  const storage = new RedisThrottlerStorage(configService);

  createdStorages.add(storage);

  return storage;
}

async function clearTestRateLimitKeys(prefix: string): Promise<void> {
  // Accept only UUID-based namespaces created by this test file.
  const allowedPrefixPattern =
    /^tarkhineh:rate-limit:integration:(?:shared:)?[0-9a-f-]{36}$/i;

  if (!allowedPrefixPattern.test(prefix)) {
    throw new Error(
      `Refusing to clear Redis keys outside the test namespace: ${prefix}`,
    );
  }

  const redis = new Redis({
    host: process.env.RATE_LIMIT_TEST_REDIS_HOST || '127.0.0.1',
    port: Number(process.env.RATE_LIMIT_TEST_REDIS_PORT || '6379'),
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();

    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefix}:*`,
        'COUNT',
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  } finally {
    if (redis.status === 'ready') {
      await redis.quit();
    } else {
      redis.disconnect();
    }
  }
}

async function waitUntilReady(storage: RedisThrottlerStorage): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await storage.checkReadiness();
      return;
    } catch (error: unknown) {
      lastError = error;
      await delay(25);
    }
  }

  throw new Error('Test Redis did not become ready within 5 seconds.', {
    cause: lastError,
  });
}

integrationSuite('RedisThrottlerStorage integration', () => {
  let storage: RedisThrottlerStorage | undefined;

  beforeEach(async () => {
    storage = createStorage();
    await waitUntilReady(storage);
  });

  afterEach(async () => {
    const storages = [...createdStorages];
    const prefixes = [...createdPrefixes];

    storage = undefined;
    createdStorages.clear();
    createdPrefixes.clear();

    // Attempt to close every storage client, even if one fails.
    const closeResults = await Promise.allSettled(
      storages.map((instance) => instance.onModuleDestroy()),
    );

    // Attempt cleanup for every namespace created by this test.
    const cleanupResults = await Promise.allSettled(
      prefixes.map((prefix) => clearTestRateLimitKeys(prefix)),
    );

    const failure = [...closeResults, ...cleanupResults].find(
      (result) => result.status === 'rejected',
    );

    if (failure?.status === 'rejected') {
      throw failure.reason;
    }
  });

  it('atomically enforces the limit across concurrent requests', async () => {
    if (!storage) {
      throw new Error('Test storage was not initialized.');
    }

    const activeStorage = storage;

    const results = await Promise.all(
      Array.from({ length: 48 }, () =>
        activeStorage.increment(
          'integration:concurrency',
          5_000,
          12,
          0,
          'concurrent',
        ),
      ),
    );

    const accepted = results.filter((result) => !result.isBlocked);
    const blocked = results.filter((result) => result.isBlocked);

    expect(accepted).toHaveLength(12);
    expect(blocked).toHaveLength(36);

    expect(
      accepted.map((result) => result.totalHits).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));

    expect(blocked.every((result) => result.totalHits === 13)).toBe(true);
  });

  it('shares one counter across independent Redis storage clients', async () => {
    const sharedPrefix = `${RATE_LIMIT_TEST_PREFIX}shared:${randomUUID()}`;

    const firstStorage = createStorage(sharedPrefix);
    const secondStorage = createStorage(sharedPrefix);

    await Promise.all([
      waitUntilReady(firstStorage),
      waitUntilReady(secondStorage),
    ]);

    const key = 'integration:shared-clients';

    const first = await firstStorage.increment(key, 5_000, 6, 0, 'distributed');

    const second = await secondStorage.increment(
      key,
      5_000,
      6,
      0,
      'distributed',
    );

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) => {
        const client = index % 2 === 0 ? firstStorage : secondStorage;

        return client.increment(key, 5_000, 6, 0, 'distributed');
      }),
    );

    const accepted = results.filter((result) => !result.isBlocked);
    const blocked = results.filter((result) => result.isBlocked);

    expect(accepted).toHaveLength(4);

    expect(
      accepted.map((result) => result.totalHits).sort((a, b) => a - b),
    ).toEqual([3, 4, 5, 6]);

    expect(blocked).toHaveLength(16);

    expect(blocked.every((result) => result.totalHits === 7)).toBe(true);
  });

  it('starts a fresh fixed window after the counter TTL expires', async () => {
    if (!storage) {
      throw new Error('Test storage was not initialized.');
    }

    const activeStorage = storage;
    const key = 'integration:window-expiration';

    expect(
      await activeStorage.increment(key, 250, 2, 0, 'fixed-window'),
    ).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });

    expect(
      await activeStorage.increment(key, 250, 2, 0, 'fixed-window'),
    ).toMatchObject({
      totalHits: 2,
      isBlocked: false,
    });

    expect(
      await activeStorage.increment(key, 250, 2, 0, 'fixed-window'),
    ).toMatchObject({
      totalHits: 3,
      isBlocked: true,
    });

    await delay(350);

    expect(
      await activeStorage.increment(key, 250, 2, 0, 'fixed-window'),
    ).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('releases a blocked tracker after the block duration expires', async () => {
    if (!storage) {
      throw new Error('Test storage was not initialized.');
    }

    const activeStorage = storage;
    const key = 'integration:block-expiration';

    expect(
      await activeStorage.increment(key, 5_000, 2, 250, 'block-window'),
    ).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });

    expect(
      await activeStorage.increment(key, 5_000, 2, 250, 'block-window'),
    ).toMatchObject({
      totalHits: 2,
      isBlocked: false,
    });

    const blocked = await activeStorage.increment(
      key,
      5_000,
      2,
      250,
      'block-window',
    );

    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    expect(blocked.timeToExpire).toBeGreaterThanOrEqual(0);

    expect(
      await activeStorage.increment(key, 5_000, 2, 250, 'block-window'),
    ).toMatchObject({
      isBlocked: true,
    });

    await delay(400);

    expect(
      await activeStorage.increment(key, 5_000, 2, 250, 'block-window'),
    ).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });
});
