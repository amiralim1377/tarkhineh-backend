import 'dotenv/config';
import '../../../src/queue/redis-client.factory.js';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaOutboundEmailDispatchStore } from '../../../src/contexts/outbound-email/infrastructure/persistence/prisma-outbound-email-dispatch.store.js';
import { OutboundEmailReconciler } from '../../../src/contexts/outbound-email/infrastructure/queue/outbound-email-reconciler.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run outbound email reconciliation tests from an unexpected database URL',
    );
  }

  url.pathname = '/tarkhineh_test';
  return url.toString();
}

const testDatabaseUrl = createTestDatabaseUrl();

const configService = {
  getOrThrow(key: string): string {
    if (key !== 'DATABASE_URL') {
      throw new Error(`Unexpected configuration key: ${key}`);
    }

    return testDatabaseUrl;
  },
} as unknown as ConfigService;

const prisma = new PrismaService(configService);
const store = new PrismaOutboundEmailDispatchStore(prisma);

const redisConnection = {
  host: process.env.REDIS_HOST?.trim() || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

const queuePrefix = `outbound-email-reconcile-${randomUUID()}`;

const transactionalQueue = new Queue(`${queuePrefix}-transactional`, {
  connection: redisConnection,
});

const bulkQueue = new Queue(`${queuePrefix}-bulk`, {
  connection: redisConnection,
});

const logger = {
  setContext: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger;

const reconciler = new OutboundEmailReconciler(
  store,
  transactionalQueue,
  bulkQueue,
  logger,
);

const testKeys: string[] = [];
const testJobs: Array<{ queue: Queue; jobId: string }> = [];

async function createStaleQueuedMessage() {
  const idempotencyKey = `reconciler-integration:${randomUUID()}`;
  testKeys.push(idempotencyKey);

  const message = await prisma.outboundEmailMessage.create({
    data: {
      idempotencyKey,
      lane: 'TRANSACTIONAL',
      templateKey: 'integration.reconciliation-test',
      payloadVersion: 1,
      encryptedPayload: 'integration-test-ciphertext',
      status: 'QUEUED',
      availableAt: new Date(Date.now() - 5 * 60_000),
      enqueuedAt: new Date(Date.now() - 5 * 60_000),
      startedAt: null,
      validUntil: new Date(Date.now() + 60 * 60_000),
    },
    select: {
      id: true,
      idempotencyKey: true,
    },
  });

  return message;
}

describe('OutboundEmailReconciler integration', () => {
  beforeAll(async () => {
    await prisma.$connect();

    await Promise.all([
      transactionalQueue.waitUntilReady(),
      bulkQueue.waitUntilReady(),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    try {
      for (const { queue, jobId } of testJobs) {
        const job = await queue.getJob(jobId);

        if (job) {
          await job.remove();
        }
      }

      if (testKeys.length > 0) {
        await prisma.outboundEmailMessage.deleteMany({
          where: {
            idempotencyKey: { in: [...testKeys] },
          },
        });
      }
    } finally {
      testJobs.length = 0;
      testKeys.length = 0;
    }
  });

  afterAll(async () => {
    try {
      // These queues have unique names for this test run.
      // Remove their Redis data before closing the connections.
      await Promise.all([
        transactionalQueue.obliterate({ force: true }),
        bulkQueue.obliterate({ force: true }),
      ]);
    } finally {
      try {
        await Promise.all([
          transactionalQueue.close(),
          bulkQueue.close(),
        ]);
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('keeps existing Redis Jobs and recovers only the missing Job', async () => {
    const existingMessage = await createStaleQueuedMessage();
    const missingMessage = await createStaleQueuedMessage();

    const existingJobId = `outbound-email-${existingMessage.id}`;

    const existingJob = await transactionalQueue.add(
      'deliver-outbound-email',
      {
        outboundEmailMessageId: existingMessage.id,
      },
      {
        jobId: existingJobId,
      },
    );

    testJobs.push({
      queue: transactionalQueue,
      jobId: existingJobId,
    });

    expect(await existingJob.getState()).toBe('waiting');

    await reconciler.reconcileStaleQueuedMessages();

    const existingPersisted =
      await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: {
          idempotencyKey: existingMessage.idempotencyKey,
        },
      });

    expect(existingPersisted.status).toBe('QUEUED');
    expect(existingPersisted.enqueuedAt).not.toBeNull();

    const missingPersisted =
      await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: {
          idempotencyKey: missingMessage.idempotencyKey,
        },
      });

    expect(missingPersisted).toMatchObject({
      status: 'RETRY_SCHEDULED',
      enqueuedAt: null,
      lastErrorCode: 'QUEUE_JOB_MISSING',
    });

    expect(missingPersisted.availableAt.getTime()).toBeGreaterThan(Date.now());

    expect(
      await transactionalQueue.getJob(`outbound-email-${missingMessage.id}`),
    ).toBeUndefined();
  });

  it('does not recover a message when Redis cannot verify Job existence', async () => {
    const message = await createStaleQueuedMessage();

    const getJobSpy = vi
      .spyOn(transactionalQueue, 'getJob')
      .mockRejectedValueOnce(new Error('Redis unavailable'));

    const recoverySpy = vi.spyOn(store, 'recoverMissingQueuedJob');

    await reconciler.reconcileStaleQueuedMessages();

    expect(getJobSpy).toHaveBeenCalledWith(`outbound-email-${message.id}`);

    expect(recoverySpy).not.toHaveBeenCalled();

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
    });

    expect(persisted.status).toBe('QUEUED');
    expect(persisted.enqueuedAt).not.toBeNull();
  });
});
