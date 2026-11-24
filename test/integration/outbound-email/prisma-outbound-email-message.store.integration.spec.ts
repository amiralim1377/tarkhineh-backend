import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaTransactionRunner } from '../../../src/prisma/transaction/prisma-transaction-runner.js';

import { UniqueId } from '../../../src/shared/domain/value-objects/unique-id.vo.js';

import { OutboundEmailIdempotencyConflictError } from '../../../src/contexts/outbound-email/application/errors/outbound-email-idempotency-conflict.error.js';

import type { CreateOutboundEmailMessageInput } from '../../../src/contexts/outbound-email/application/ports/outbound-email-message-store.port.js';

import { PrismaOutboundEmailMessageStore } from '../../../src/contexts/outbound-email/infrastructure/persistence/prisma-outbound-email-message.store.js';

// ============================================================
// TEST DATABASE SAFETY
// ============================================================

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run Outbound Email integration tests from an unexpected database URL',
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

const transactionRunner = new PrismaTransactionRunner(prisma);

const messageStore = new PrismaOutboundEmailMessageStore();

// ============================================================
// FIXTURES
// ============================================================

const idempotencyKeys = new Set<string>();

function createInput(
  overrides: Partial<CreateOutboundEmailMessageInput> = {},
): CreateOutboundEmailMessageInput {
  const suffix = randomUUID();

  const input: CreateOutboundEmailMessageInput = {
    idempotencyKey: `integration-test:${suffix}`,
    requestFingerprint: 'a'.repeat(64),
    lane: 'TRANSACTIONAL',
    templateKey: 'organization.membership-invitation',
    payloadVersion: 1,
    encryptedPayload: 'v1:integration-encrypted-payload',
    validUntil: new Date(Date.now() + 60 * 60 * 1000),
    aggregateType: 'MembershipInvitation',
    aggregateId: `invitation-${suffix}`,
    ...overrides,
  };

  idempotencyKeys.add(input.idempotencyKey);

  return input;
}

async function createLegacyMessage(
  input: CreateOutboundEmailMessageInput,
): Promise<void> {
  await prisma.outboundEmailMessage.create({
    data: {
      id: new UniqueId().getValue(),
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: null,
      lane: input.lane,
      templateKey: input.templateKey,
      payloadVersion: input.payloadVersion,
      encryptedPayload: input.encryptedPayload,
      validUntil: input.validUntil,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
    },
  });
}

// ============================================================
// TEST SUITE
// ============================================================

describe('PrismaOutboundEmailMessageStore Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (idempotencyKeys.size === 0) {
      return;
    }

    await prisma.outboundEmailMessage.deleteMany({
      where: {
        idempotencyKey: {
          in: [...idempotencyKeys],
        },
      },
    });

    idempotencyKeys.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------

  it('creates and commits a new outbound email message', async () => {
    const input = createInput();

    const result = await transactionRunner.execute((context) =>
      messageStore.createOrGet(input, context),
    );

    expect(result.created).toBe(true);
    expect(result.messageId).toBeTruthy();

    const persisted = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.id).toBe(result.messageId);
    expect(persisted?.requestFingerprint).toBe(input.requestFingerprint);
    expect(persisted?.lane).toBe(input.lane);
    expect(persisted?.templateKey).toBe(input.templateKey);
    expect(persisted?.payloadVersion).toBe(input.payloadVersion);
    expect(persisted?.encryptedPayload).toBe(input.encryptedPayload);
    expect(persisted?.status).toBe('PENDING');
  });

  // ----------------------------------------------------------
  // IDEMPOTENCY
  // ----------------------------------------------------------

  it('returns the existing message when the idempotency key and fingerprint match', async () => {
    const input = createInput();

    const firstResult = await transactionRunner.execute((context) =>
      messageStore.createOrGet(input, context),
    );

    const secondResult = await transactionRunner.execute((context) =>
      messageStore.createOrGet(input, context),
    );

    expect(firstResult.created).toBe(true);
    expect(secondResult.created).toBe(false);

    expect(secondResult.messageId).toBe(firstResult.messageId);

    const persistedMessages = await prisma.outboundEmailMessage.findMany({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persistedMessages).toHaveLength(1);
  });

  it('does not overwrite an existing message when its idempotency key is reused', async () => {
    const input = createInput();

    const firstResult = await transactionRunner.execute((context) =>
      messageStore.createOrGet(input, context),
    );

    const secondResult = await transactionRunner.execute((context) =>
      messageStore.createOrGet(
        {
          ...input,
          // A newly encrypted payload can differ because AES-GCM uses
          // a fresh IV, even when the logical request is identical.
          encryptedPayload: 'v1:different-ciphertext',
        },
        context,
      ),
    );

    expect(secondResult.created).toBe(false);
    expect(secondResult.messageId).toBe(firstResult.messageId);

    const persisted = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persisted?.encryptedPayload).toBe(input.encryptedPayload);
    expect(persisted?.requestFingerprint).toBe(input.requestFingerprint);
  });

  it('rejects reuse of an idempotency key with a different fingerprint', async () => {
    const input = createInput();

    const firstResult = await transactionRunner.execute((context) =>
      messageStore.createOrGet(input, context),
    );

    await expect(
      transactionRunner.execute((context) =>
        messageStore.createOrGet(
          {
            ...input,
            requestFingerprint: 'b'.repeat(64),
          },
          context,
        ),
      ),
    ).rejects.toBeInstanceOf(OutboundEmailIdempotencyConflictError);

    const persisted = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persisted?.id).toBe(firstResult.messageId);
    expect(persisted?.requestFingerprint).toBe(input.requestFingerprint);
    expect(persisted?.encryptedPayload).toBe(input.encryptedPayload);
  });

  it('rejects reuse of a legacy idempotency key without a fingerprint', async () => {
    const input = createInput();

    await createLegacyMessage(input);

    await expect(
      transactionRunner.execute((context) =>
        messageStore.createOrGet(input, context),
      ),
    ).rejects.toBeInstanceOf(OutboundEmailIdempotencyConflictError);

    const persisted = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persisted?.requestFingerprint).toBeNull();
    expect(persisted?.encryptedPayload).toBe(input.encryptedPayload);
  });

  // ----------------------------------------------------------
  // ROLLBACK
  // ----------------------------------------------------------

  it('rolls back a newly created message when the surrounding transaction fails', async () => {
    const input = createInput();

    const expectedError = new Error(
      'Intentional Outbound Email integration rollback.',
    );

    await expect(
      transactionRunner.execute(async (context) => {
        const result = await messageStore.createOrGet(input, context);

        expect(result.created).toBe(true);

        throw expectedError;
      }),
    ).rejects.toBe(expectedError);

    const persisted = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persisted).toBeNull();
  });

  // ----------------------------------------------------------
  // CONCURRENCY
  // ----------------------------------------------------------

  it('handles concurrent requests with the same idempotency key', async () => {
    const input = createInput();

    let startedTransactions = 0;
    let releaseTransactions: () => void = () => {};

    const bothTransactionsStarted = new Promise<void>((resolve) => {
      releaseTransactions = resolve;
    });

    const executeRequest = () =>
      transactionRunner.execute(
        async (context) => {
          startedTransactions += 1;

          if (startedTransactions === 2) {
            releaseTransactions();
          }

          // Ensure both independent transactions attempt the insert
          // after they have both started.
          await bothTransactionsStarted;

          return messageStore.createOrGet(input, context);
        },
        {
          isolationLevel: 'READ_COMMITTED',
        },
      );

    const results = await Promise.all([executeRequest(), executeRequest()]);

    expect(startedTransactions).toBe(2);

    expect(results.filter((result) => result.created)).toHaveLength(1);

    expect(results.filter((result) => !result.created)).toHaveLength(1);

    expect(results[0]?.messageId).toBe(results[1]?.messageId);

    const persistedMessages = await prisma.outboundEmailMessage.findMany({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
    });

    expect(persistedMessages).toHaveLength(1);
    expect(persistedMessages[0]?.requestFingerprint).toBe(
      input.requestFingerprint,
    );
  });
});
