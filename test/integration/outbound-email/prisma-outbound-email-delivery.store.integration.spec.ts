import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaOutboundEmailDeliveryStore } from '../../../src/contexts/outbound-email/infrastructure/persistence/prisma-outbound-email-delivery.store.js';

type Lane = 'TRANSACTIONAL' | 'BULK';
type InitialStatus = 'PENDING' | 'DISPATCHING' | 'QUEUED' | 'PROCESSING';

interface CreateMessageOptions {
  readonly lane?: Lane;
  readonly status?: InitialStatus;
  readonly validUntil?: Date | null;
  readonly aggregateType?: string | null;
  readonly aggregateId?: string | null;
}

interface CreatePasswordResetChallengeOptions {
  readonly expiresAt?: Date;
  readonly consumedAt?: Date | null;
  readonly invalidatedAt?: Date | null;
}

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

  if (
    decodeURIComponent(url.pathname.replace(/^\/+/, '')) !== 'tarkhineh_test'
  ) {
    throw new Error('Refusing to run tests against an unexpected database');
  }

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
const store = new PrismaOutboundEmailDeliveryStore(prisma);

const testKeys: string[] = [];
const testUserIds: string[] = [];

function deliveryInput(messageId: string, lane: Lane = 'TRANSACTIONAL') {
  return {
    messageId,
    lane,
    workerPrefix: `integration-worker:${randomUUID()}`,
    leaseDurationMs: 60_000,
  } as const;
}

async function createMessage(options: CreateMessageOptions = {}) {
  const idempotencyKey = `outbound-delivery-test:${randomUUID()}`;
  testKeys.push(idempotencyKey);

  const lane = options.lane ?? 'TRANSACTIONAL';
  const status = options.status ?? 'PENDING';
  const now = Date.now();

  return prisma.outboundEmailMessage.create({
    data: {
      idempotencyKey,
      lane,
      templateKey: 'integration.test',
      payloadVersion: 1,
      encryptedPayload: 'integration-test-ciphertext',
      status,
      availableAt: new Date(now - 5_000),
      validUntil: options.validUntil ?? null,
      aggregateType: options.aggregateType ?? null,
      aggregateId: options.aggregateId ?? null,

      ...(status === 'DISPATCHING'
        ? {
            lockedBy: `dispatcher:${randomUUID()}`,
            lockedUntil: new Date(now + 60_000),
          }
        : {}),

      ...(status === 'QUEUED'
        ? {
            enqueuedAt: new Date(now - 5_000),
          }
        : {}),

      ...(status === 'PROCESSING'
        ? {
            lockedBy: `expired-worker:${randomUUID()}`,
            lockedUntil: new Date(now - 5_000),
            startedAt: new Date(now - 10_000),
            deliveryAttempts: 1,
          }
        : {}),
    },
    select: {
      id: true,
      idempotencyKey: true,
    },
  });
}

async function createPasswordResetChallenge(
  options: CreatePasswordResetChallengeOptions = {},
) {
  const email = `outbound-email-test-${randomUUID()}@example.test`;

  const user = await prisma.user.create({
    data: { email },
    select: { id: true },
  });

  testUserIds.push(user.id);

  const challenge = await prisma.passwordResetChallenge.create({
    data: {
      userId: user.id,
      email,
      tokenHash: `integration-test-token:${randomUUID()}`,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 10 * 60_000),
      consumedAt: options.consumedAt ?? null,
      invalidatedAt: options.invalidatedAt ?? null,
    },
    select: { id: true },
  });

  return challenge;
}
async function claimMessage(messageId: string) {
  const claimed = await store.claimForDelivery(deliveryInput(messageId));

  if (!claimed) {
    throw new Error('Expected the Worker to claim the message');
  }

  return claimed;
}

describe('PrismaOutboundEmailDeliveryStore integration', () => {
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

      if (testUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [...testUserIds],
            },
          },
        });
      }
    } finally {
      testKeys.length = 0;
      testUserIds.length = 0;
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('claims a DISPATCHING message while the dispatcher lease is valid', async () => {
    const message = await createMessage({ status: 'DISPATCHING' });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    expect(claimed).not.toBeNull();

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    expect(claimed).toMatchObject({
      messageId: message.id,
      lane: 'TRANSACTIONAL',
      leaseToken: expect.any(String),
      leaseUntil: expect.any(Date),
      templateKey: 'integration.test',
      payloadVersion: 1,
      encryptedPayload: 'integration-test-ciphertext',
      validUntil: null,
    });

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('PROCESSING');
    expect(persisted.lockedBy).toBe(claimed.leaseToken);
    expect(persisted.lockedUntil).toEqual(claimed.leaseUntil);
    expect(persisted.deliveryAttempts).toBe(1);
    expect(persisted.startedAt).toBeInstanceOf(Date);
  });

  it('allows only one concurrent Worker to claim a queued message', async () => {
    const message = await createMessage({ status: 'QUEUED' });

    const [first, second] = await Promise.all([
      store.claimForDelivery(deliveryInput(message.id)),
      store.claimForDelivery(deliveryInput(message.id)),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);

    const winner = first ?? second;

    if (!winner) {
      throw new Error('Expected one Worker to claim the message');
    }

    const staleOwnerResult = await store.markAccepted({
      messageId: message.id,
      leaseToken: 'stale-worker-token',
      providerMessageId: null,
    });

    expect(staleOwnerResult).toBe(false);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('PROCESSING');
    expect(persisted.lockedBy).toBe(winner.leaseToken);
    expect(persisted.deliveryAttempts).toBe(1);
  });

  it('expires a queued message instead of claiming it when validity has passed', async () => {
    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() - 10_000),
    });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    expect(claimed).toBeNull();

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('EXPIRED');
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBe('MESSAGE_EXPIRED');
  });

  it('renews the current lease before delivery when the message is valid', async () => {
    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() + 120_000),
    });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    const result = await store.prepareForDelivery({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      leaseDurationMs: 60_000,
    });

    expect(result).toBe('READY');

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('PROCESSING');
    expect(persisted.lockedBy).toBe(claimed.leaseToken);
    expect(persisted.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('expires a processing message when it becomes invalid before delivery', async () => {
    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() + 120_000),
    });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    await prisma.outboundEmailMessage.update({
      where: { idempotencyKey: message.idempotencyKey },
      data: {
        validUntil: new Date(Date.now() - 1_000),
      },
    });

    const result = await store.prepareForDelivery({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      leaseDurationMs: 60_000,
    });

    expect(result).toBe('EXPIRED');

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('EXPIRED');
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
  });
  it('prepares delivery for a valid password-reset challenge', async () => {
    const challenge = await createPasswordResetChallenge();

    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() + 5 * 60_000),
      aggregateType: 'PasswordResetChallenge',
      aggregateId: challenge.id,
    });

    const claimed = await claimMessage(message.id);

    const result = await store.prepareForDelivery({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      leaseDurationMs: 60_000,
    });

    expect(result).toBe('READY');

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('PROCESSING');
    expect(persisted.lockedBy).toBe(claimed.leaseToken);
    expect(persisted.encryptedPayload).toBe('integration-test-ciphertext');

    const persistedChallenge =
      await prisma.passwordResetChallenge.findUniqueOrThrow({
        where: { id: challenge.id },
      });

    expect(persistedChallenge.consumedAt).toBeNull();
    expect(persistedChallenge.invalidatedAt).toBeNull();
  });

  it.each(['consumed', 'invalidated'] as const)(
    'cancels delivery when the challenge is %s',
    async (state) => {
      const challenge = await createPasswordResetChallenge(
        state === 'consumed'
          ? { consumedAt: new Date() }
          : { invalidatedAt: new Date() },
      );

      const message = await createMessage({
        status: 'QUEUED',
        validUntil: new Date(Date.now() + 5 * 60_000),
        aggregateType: 'PasswordResetChallenge',
        aggregateId: challenge.id,
      });

      const claimed = await claimMessage(message.id);

      const result = await store.prepareForDelivery({
        messageId: message.id,
        leaseToken: claimed.leaseToken,
        leaseDurationMs: 60_000,
      });

      expect(result).toBe('CANCELLED');

      const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: { idempotencyKey: message.idempotencyKey },
      });

      expect(persisted.status).toBe('CANCELLED');
      expect(persisted.cancelledAt).toBeInstanceOf(Date);
      expect(persisted.encryptedPayload).toBeNull();
      expect(persisted.lockedBy).toBeNull();
      expect(persisted.lockedUntil).toBeNull();
      expect(persisted.lastErrorCode).toBe('CHALLENGE_INELIGIBLE');
    },
  );

  it('expires delivery when the password-reset challenge has expired', async () => {
    const challenge = await createPasswordResetChallenge({
      expiresAt: new Date(Date.now() - 5_000),
    });

    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() + 5 * 60_000),
      aggregateType: 'PasswordResetChallenge',
      aggregateId: challenge.id,
    });

    const claimed = await claimMessage(message.id);

    const result = await store.prepareForDelivery({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      leaseDurationMs: 60_000,
    });

    expect(result).toBe('EXPIRED');

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('EXPIRED');
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBe('CHALLENGE_EXPIRED');
  });

  it('cancels delivery when the password-reset challenge was deleted', async () => {
    const challenge = await createPasswordResetChallenge();

    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() + 5 * 60_000),
      aggregateType: 'PasswordResetChallenge',
      aggregateId: challenge.id,
    });

    const claimed = await claimMessage(message.id);

    await prisma.passwordResetChallenge.delete({
      where: { id: challenge.id },
    });

    const result = await store.prepareForDelivery({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      leaseDurationMs: 60_000,
    });

    expect(result).toBe('CANCELLED');

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBe('CHALLENGE_INELIGIBLE');
  });

  it('does not mutate a message when its delivery lease expires before preparation', async () => {
    const message = await createMessage({
      status: 'QUEUED',
      validUntil: new Date(Date.now() + 120_000),
    });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    // Simulate the lease expiring before preparation starts.
    await prisma.outboundEmailMessage.update({
      where: { idempotencyKey: message.idempotencyKey },
      data: {
        lockedUntil: new Date(Date.now() - 5_000),
      },
    });

    const result = await store.prepareForDelivery({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      leaseDurationMs: 60_000,
    });

    expect(result).toBe('LEASE_LOST');

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('PROCESSING');
    expect(persisted.lockedBy).toBe(claimed.leaseToken);
    expect(persisted.lockedUntil?.getTime()).toBeLessThan(Date.now());
    expect(persisted.encryptedPayload).toBe('integration-test-ciphertext');
  });

  it('records confirmed Provider acceptance and clears the encrypted payload', async () => {
    const message = await createMessage({ status: 'QUEUED' });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    const accepted = await store.markAccepted({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      providerMessageId: 'integration-provider-message-id',
    });

    expect(accepted).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('ACCEPTED');
    expect(persisted.providerMessageId).toBe('integration-provider-message-id');
    expect(persisted.sentAt).toBeInstanceOf(Date);
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBeNull();
  });

  it('schedules a safe retry and releases the current delivery lease', async () => {
    const message = await createMessage({ status: 'QUEUED' });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    const scheduled = await store.scheduleRetry({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      retryDelayMs: 10_000,
      errorCode: 'PROVIDER_TEMPORARY_REJECTION',
    });

    expect(scheduled).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('RETRY_SCHEDULED');
    expect(persisted.availableAt.getTime()).toBeGreaterThan(Date.now() + 7_000);
    expect(persisted.startedAt).toBeNull();
    expect(persisted.enqueuedAt).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBe('PROVIDER_TEMPORARY_REJECTION');
    expect(persisted.encryptedPayload).toBe('integration-test-ciphertext');
  });

  it('marks permanently undeliverable messages DEAD', async () => {
    const message = await createMessage({ status: 'QUEUED' });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    const marked = await store.markDead({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      errorCode: 'UNSUPPORTED_TEMPLATE',
    });

    expect(marked).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('DEAD');
    expect(persisted.failedAt).toBeInstanceOf(Date);
    expect(persisted.encryptedPayload).toBeNull();
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
    expect(persisted.lastErrorCode).toBe('UNSUPPORTED_TEMPLATE');
  });

  it('records an ambiguous Provider outcome without scheduling a retry', async () => {
    const message = await createMessage({ status: 'QUEUED' });

    const claimed = await store.claimForDelivery(deliveryInput(message.id));

    if (!claimed) {
      throw new Error('Expected the Worker to claim the message');
    }

    const marked = await store.markOutcomeUnknown({
      messageId: message.id,
      leaseToken: claimed.leaseToken,
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    });

    expect(marked).toBe(true);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('OUTCOME_UNKNOWN');
    expect(persisted.lastErrorCode).toBe('PROVIDER_OUTCOME_UNKNOWN');
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();

    // Keep the encrypted payload for later investigation/reconciliation.
    expect(persisted.encryptedPayload).toBe('integration-test-ciphertext');
  });

  it('moves expired processing leases to OUTCOME_UNKNOWN instead of retrying', async () => {
    const message = await createMessage({ status: 'PROCESSING' });

    const recovered = await store.recoverExpiredProcessingMessages(10);

    expect(recovered).toBeGreaterThanOrEqual(1);

    const persisted = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: message.idempotencyKey },
    });

    expect(persisted.status).toBe('OUTCOME_UNKNOWN');
    expect(persisted.lastErrorCode).toBe('PROCESSING_LEASE_EXPIRED');
    expect(persisted.lockedBy).toBeNull();
    expect(persisted.lockedUntil).toBeNull();
  });
});
