import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaOutboundEmailDispatchStore } from '../../../src/contexts/outbound-email/infrastructure/persistence/prisma-outbound-email-dispatch.store.js';

type Lane = 'TRANSACTIONAL' | 'BULK';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run outbound-email integration tests from an unexpected database URL',
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

const testKeys: string[] = [];

function claimInput(lane: Lane = 'TRANSACTIONAL') {
  return {
    lane,
    batchSize: 10,
    leaseDurationMs: 60_000,
    ownerPrefix: `integration-test:${randomUUID()}`,
  } as const;
}

async function createMessage(
  lane: Lane = 'TRANSACTIONAL',
  validUntil: Date | null = null,
) {
  const idempotencyKey = `outbound-dispatch-test:${randomUUID()}`;
  testKeys.push(idempotencyKey);

  return prisma.outboundEmailMessage.create({
    data: {
      idempotencyKey,
      lane,
      templateKey: 'integration.test',
      payloadVersion: 1,
      encryptedPayload: 'integration-test-ciphertext',
      status: 'PENDING',
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
      validUntil,
    },
    select: {
      id: true,
      idempotencyKey: true,
    },
  });
}

describe('PrismaOutboundEmailDispatchStore integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    try {
      if (testKeys.length > 0) {
        await prisma.outboundEmailMessage.deleteMany({
          where: {
            idempotencyKey: {
              in: [...testKeys],
            },
          },
        });
      }
    } finally {
      testKeys.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('atomically claims a pending message and creates a lease', async () => {
    const message = await createMessage();

    const claims = await store.claimBatch(claimInput());
    const messageClaims = claims.filter(
      (claim) => claim.messageId === message.id,
    );

    // claimBatch returns eligible messages from the entire lane, not only
    // the fixture created by this test.
    expect(messageClaims).toHaveLength(1);

    const lease = messageClaims[0];

    if (!lease) {
      throw new Error('Expected one dispatch lease');
    }

    expect(lease).toMatchObject({
      messageId: message.id,
      lane: 'TRANSACTIONAL',
      leaseToken: expect.any(String),
      leaseUntil: expect.any(Date),
    });

    expect(lease.leaseToken.length).toBeGreaterThan(0);
    expect(lease.leaseUntil.getTime()).toBeGreaterThan(Date.now());

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
    });

    expect(persisted).toMatchObject({
      status: 'DISPATCHING',
      lockedBy: lease.leaseToken,
      lockedUntil: lease.leaseUntil,
      dispatchAttempts: 1,
    });
  });

  it('does not allow two concurrent dispatchers to claim the same message', async () => {
    const message = await createMessage();

    const [firstClaims, secondClaims] = await Promise.all([
      store.claimBatch(claimInput()),
      store.claimBatch(claimInput()),
    ]);

    const leases = [...firstClaims, ...secondClaims];
    const messageLeases = leases.filter(
      (candidate) => candidate.messageId === message.id,
    );

    // Concurrent dispatchers may legitimately claim different messages.
    // The guarantee under test is that this particular message is claimed once.
    expect(messageLeases).toHaveLength(1);

    const lease = messageLeases[0];

    if (!lease) {
      throw new Error('Expected one dispatcher to claim the message');
    }

    expect(lease.messageId).toBe(message.id);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
    });

    expect(persisted.status).toBe('DISPATCHING');
    expect(persisted.lockedBy).toBe(lease.leaseToken);
    expect(persisted.dispatchAttempts).toBe(1);
  });

  it('reclaims an expired lease and rejects the former owner', async () => {
    const message = await createMessage();

    const firstClaims = await store.claimBatch(claimInput());
    const firstLease = firstClaims[0];

    if (!firstLease) {
      throw new Error('Expected the first dispatch lease');
    }

    await prisma.outboundEmailMessage.update({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
      data: {
        lockedUntil: new Date(Date.now() - 1_000),
      },
    });

    const secondClaims = await store.claimBatch(claimInput());
    const secondLease = secondClaims.find(
      (lease) => lease.messageId === message.id,
    );

    if (!secondLease) {
      throw new Error('Expected the expired lease to be reclaimed');
    }

    expect(secondLease.leaseToken).not.toBe(firstLease.leaseToken);

    const oldOwnerResult = await store.markQueued({
      messageId: message.id,
      leaseToken: firstLease.leaseToken,
    });

    expect(oldOwnerResult).toBe(false);

    const currentOwnerResult = await store.markQueued({
      messageId: message.id,
      leaseToken: secondLease.leaseToken,
    });

    expect(currentOwnerResult).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
    });

    expect(persisted.status).toBe('QUEUED');
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
  });

  it('schedules retry and releases the current lease after an enqueue failure', async () => {
    const message = await createMessage();

    const claims = await store.claimBatch(claimInput());
    const lease = claims[0];

    if (!lease) {
      throw new Error('Expected a dispatch lease');
    }

    const updated = await store.scheduleRetry({
      messageId: message.id,
      leaseToken: lease.leaseToken,
      retryDelayMs: 30_000,
      errorCode: 'QUEUE_ENQUEUE_FAILED',
    });

    expect(updated).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
    });

    expect(persisted.status).toBe('RETRY_SCHEDULED');
    expect(persisted.lastErrorCode).toBe('QUEUE_ENQUEUE_FAILED');
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.availableAt.getTime()).toBeGreaterThan(Date.now());

    const staleRetry = await store.scheduleRetry({
      messageId: message.id,
      leaseToken: lease.leaseToken,
      retryDelayMs: 30_000,
      errorCode: 'QUEUE_ENQUEUE_FAILED',
    });

    expect(staleRetry).toBe(false);
  });

  it('expires a message whose validity period has passed', async () => {
    const message = await createMessage(
      'TRANSACTIONAL',
      new Date(Date.now() - 1_000),
    );

    const claims = await store.claimBatch(claimInput());

    expect(claims.some((lease) => lease.messageId === message.id)).toBe(false);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: message.idempotencyKey,
      },
    });

    expect(persisted.status).toBe('EXPIRED');
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBe('MESSAGE_EXPIRED');
  });

  it('claims only messages from the requested lane', async () => {
    const transactional = await createMessage('TRANSACTIONAL');
    const bulk = await createMessage('BULK');

    const claims = await store.claimBatch(claimInput('TRANSACTIONAL'));

    expect(claims.map((lease) => lease.messageId)).toContain(transactional.id);

    expect(claims.map((lease) => lease.messageId)).not.toContain(bulk.id);

    const persistedBulk = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey: bulk.idempotencyKey,
      },
    });

    expect(persistedBulk.status).toBe('PENDING');
  });

  it('finds only stale queued messages that have not started processing', async () => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 60_000);
    const staleEnqueuedAt = new Date(now.getTime() - 120_000);
    const recentEnqueuedAt = new Date(now.getTime() - 5_000);
    const futureExpiration = new Date(now.getTime() + 60 * 60 * 1_000);

    const staleMessage = await createMessage('TRANSACTIONAL', futureExpiration);

    const recentMessage = await createMessage(
      'TRANSACTIONAL',
      futureExpiration,
    );

    const processingMessage = await createMessage(
      'TRANSACTIONAL',
      futureExpiration,
    );

    await prisma.outboundEmailMessage.update({
      where: {
        id: staleMessage.id,
      },
      data: {
        status: 'QUEUED',
        enqueuedAt: staleEnqueuedAt,
        startedAt: null,
      },
    });

    await prisma.outboundEmailMessage.update({
      where: {
        id: recentMessage.id,
      },
      data: {
        status: 'QUEUED',
        enqueuedAt: recentEnqueuedAt,
        startedAt: null,
      },
    });

    await prisma.outboundEmailMessage.update({
      where: {
        id: processingMessage.id,
      },
      data: {
        status: 'PROCESSING',
        enqueuedAt: staleEnqueuedAt,
        startedAt: new Date(now.getTime() - 30_000),
      },
    });

    const candidates = await store.findStaleQueuedMessages({
      lane: 'TRANSACTIONAL',
      batchSize: 50,
      queuedBefore: staleBefore,
      reconciledBefore: new Date(now.getTime() - 120_000),
      now,
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: staleMessage.id,
          lane: 'TRANSACTIONAL',
          reconciledAt: expect.any(Date),
        }),
      ]),
    );

    expect(
      candidates.some((candidate) => candidate.messageId === recentMessage.id),
    ).toBe(false);

    expect(
      candidates.some(
        (candidate) => candidate.messageId === processingMessage.id,
      ),
    ).toBe(false);
  });

  it('conditionally recovers a missing queued job without overwriting newer state', async () => {
    const now = new Date();
    const queuedBefore = new Date(now.getTime() - 60_000);
    const reconciledBefore = new Date(now.getTime() - 120_000);
    const enqueuedAt = new Date(now.getTime() - 120_000);
    const retryAt = new Date(now.getTime() + 5_000);

    const message = await createMessage(
      'TRANSACTIONAL',
      new Date(now.getTime() + 60 * 60 * 1_000),
    );

    await prisma.outboundEmailMessage.update({
      where: {
        id: message.id,
      },
      data: {
        status: 'QUEUED',
        enqueuedAt,
        startedAt: null,
      },
    });

    // Obtain the actual reconciliation timestamp persisted by PostgreSQL.
    const candidates = await store.findStaleQueuedMessages({
      lane: 'TRANSACTIONAL',
      batchSize: 50,
      queuedBefore,
      reconciledBefore,
      now,
    });

    const candidate = candidates.find((item) => item.messageId === message.id);

    if (!candidate) {
      throw new Error(
        'Expected the queued message to be selected for reconciliation',
      );
    }

    const recovered = await store.recoverMissingQueuedJob({
      messageId: message.id,
      lane: 'TRANSACTIONAL',
      queuedBefore,
      reconciledAt: candidate.reconciledAt,
      now,
      retryAt,
    });

    expect(recovered).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        id: message.id,
      },
    });

    expect(persisted).toMatchObject({
      status: 'RETRY_SCHEDULED',
      availableAt: retryAt,
      enqueuedAt: null,
      startedAt: null,
      lockedBy: null,
      lockedUntil: null,
      lastErrorCode: 'QUEUE_JOB_MISSING',
    });

    // A repeated recovery attempt with the old observation must not match.
    const recoveredAgain = await store.recoverMissingQueuedJob({
      messageId: message.id,
      lane: 'TRANSACTIONAL',
      queuedBefore,
      reconciledAt: candidate.reconciledAt,
      now,
      retryAt,
    });

    expect(recoveredAgain).toBe(false);
  });
});
