import 'dotenv/config';
import '../../../src/queue/redis-client.factory.js';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaEmailRegistrationRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-registration.repository.js';
import { EmailOutboxDispatcher } from '../../../src/contexts/identity-access/infrastructure/queue/email-outbox-dispatcher.js';
import { IdentityUser } from '../../../src/contexts/identity-access/domain/entities/identity-user.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  // Never use the development database for this test.
  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run integration tests with an unexpected database URL',
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

const queueName = `email-outbox-integration-${randomUUID()}`;

const queue = new Queue(queueName, {
  connection: {
    host: process.env.REDIS_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
  },
});

const loggerError = vi.fn();

const logger = {
  setContext: vi.fn(),
  error: loggerError,
} as unknown as PinoLogger;

const repository = new PrismaEmailRegistrationRepository(prisma);

const dispatcher = new EmailOutboxDispatcher(prisma, queue, logger);

let testEmail: string | undefined;
let testJobId: string | undefined;

describe('EmailOutboxDispatcher with PostgreSQL and Redis', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await queue.waitUntilReady();
  });

  afterAll(async () => {
    try {
      if (testJobId) {
        const job = await queue.getJob(testJobId);

        if (job) {
          await job.remove();
        }
      }

      if (testEmail) {
        await prisma.user.deleteMany({
          where: {
            email: testEmail,
          },
        });
      }
    } finally {
      await queue.close();
      await prisma.$disconnect();
    }
  });

  it('moves a persisted outbox message into a real BullMQ queue', async () => {
    testEmail = `integration-${randomUUID()}@example.com`;

    const tokenHash = randomUUID();

    const registrationResult = await repository.createPendingRegistration({
      user: IdentityUser.registerPending({
        email: testEmail,
        passwordHash: 'integration-test-password-hash',
        displayName: 'Integration Test',
      }),
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      encryptedToken: 'v1:integration-test-encrypted-payload',
    });

    expect(registrationResult).toBe(true);

    const challenge = await prisma.emailVerificationChallenge.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        outboxMessage: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    expect(challenge).not.toBeNull();
    expect(challenge?.outboxMessage).not.toBeNull();

    if (!challenge?.outboxMessage) {
      throw new Error('Expected a persisted outbox message');
    }

    const outboxMessage = challenge.outboxMessage;

    expect(outboxMessage.status).toBe('PENDING');

    testJobId = `email-verification-${outboxMessage.id}`;

    // The queue has a unique name and no Worker attached, so this test
    // cannot trigger a real email delivery.
    await dispatcher.dispatchPendingMessages();

    const queuedJob = await queue.getJob(testJobId);

    expect(queuedJob).not.toBeUndefined();

    if (!queuedJob) {
      throw new Error('Expected the BullMQ job to exist');
    }

    expect(queuedJob.name).toBe('send-verification-email');
    expect(queuedJob.data).toEqual({
      outboxMessageId: outboxMessage.id,
    });

    expect(await queuedJob.getState()).toBe('waiting');

    const persistedOutbox = await prisma.emailOutboxMessage.findUnique({
      where: {
        id: outboxMessage.id,
      },
      select: {
        status: true,
        enqueuedAt: true,
      },
    });

    expect(persistedOutbox).toMatchObject({
      status: 'QUEUED',
      enqueuedAt: expect.any(Date),
    });
  });
});
