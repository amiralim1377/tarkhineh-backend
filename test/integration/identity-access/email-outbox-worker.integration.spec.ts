import 'dotenv/config';
import '../../../src/queue/redis-client.factory.js';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, Worker } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaEmailRegistrationRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-registration.repository.js';
import { EmailOutboxDispatcher } from '../../../src/contexts/identity-access/infrastructure/queue/email-outbox-dispatcher.js';
import { EmailVerificationProcessor } from '../../../src/contexts/identity-access/infrastructure/security/email-verification.processor.js';
import type { EmailTokenEncryptor } from '../../../src/contexts/identity-access/application/ports/email-token-encryptor.port.js';
import type { EmailVerificationSender } from '../../../src/contexts/identity-access/application/ports/email-verification-sender.port.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run this integration test against an unexpected database',
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

const redisConnection = {
  host: process.env.REDIS_HOST?.trim() || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

const prisma = new PrismaService(configService);

const queueName = `email-outbox-worker-integration-${randomUUID()}`;

const queue = new Queue(queueName, {
  connection: redisConnection,
});

const queueEvents = new QueueEvents(queueName, {
  connection: redisConnection,
});

const tokenEncryptor = {
  decrypt: vi.fn().mockReturnValue('raw-integration-test-token'),
} as unknown as EmailTokenEncryptor;

const emailSenderMock = vi.fn().mockResolvedValue(undefined);

const emailSender = {
  sendVerificationEmail: emailSenderMock,
} as unknown as EmailVerificationSender;

const loggerError = vi.fn();

const logger = {
  setContext: vi.fn(),
  error: loggerError,
} as unknown as PinoLogger;

const registrationRepository = new PrismaEmailRegistrationRepository(prisma);

const dispatcher = new EmailOutboxDispatcher(prisma, queue, logger);

const processor = new EmailVerificationProcessor(
  prisma,
  tokenEncryptor,
  emailSender,
  logger,
);

// This test worker consumes only its unique test queue.
const worker = new Worker(queueName, async (job) => processor.process(job), {
  connection: redisConnection,
  concurrency: 1,
});

let testEmail: string | undefined;
let testJobId: string | undefined;

describe('Email outbox to BullMQ worker integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await queue.waitUntilReady();
    await queueEvents.waitUntilReady();
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    try {
      await worker.close();
      await queueEvents.close();

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

  it('dispatches a persisted outbox message and processes it without real SMTP', async () => {
    testEmail = `integration-${randomUUID()}@example.com`;

    const tokenHash = randomUUID();
    const encryptedToken = 'v1:integration-test-encrypted-payload';

    const created = await registrationRepository.createPendingRegistration({
      email: testEmail,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Integration Test',
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      encryptedToken,
    });

    expect(created).toBe(true);

    const challenge = await prisma.emailVerificationChallenge.findUnique({
      where: { tokenHash },
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

    expect(challenge?.outboxMessage).not.toBeNull();

    if (!challenge?.outboxMessage) {
      throw new Error(
        'Expected an outbox message for the verification challenge',
      );
    }

    const outboxMessage = challenge.outboxMessage;

    expect(outboxMessage.status).toBe('PENDING');

    testJobId = `email-verification-${outboxMessage.id}`;

    await dispatcher.dispatchPendingMessages();

    const job = await queue.getJob(testJobId);

    expect(job).toBeDefined();

    if (!job) {
      throw new Error('Expected the job to be added to BullMQ');
    }

    expect(job.name).toBe('send-verification-email');
    expect(job.data).toEqual({
      outboxMessageId: outboxMessage.id,
    });

    // Wait until the real BullMQ worker finishes processing the job.
    await job.waitUntilFinished(queueEvents, 10_000);

    const persistedOutbox = await prisma.emailOutboxMessage.findUnique({
      where: {
        id: outboxMessage.id,
      },
      select: {
        status: true,
        sentAt: true,
        attempts: true,
        lastErrorCode: true,
        encryptedToken: true,
      },
    });

    expect(persistedOutbox).toMatchObject({
      status: 'SENT',
      sentAt: expect.any(Date),
      attempts: 1,
      lastErrorCode: null,
      encryptedToken: null,
    });

    expect(emailSenderMock).toHaveBeenCalledOnce();
    expect(emailSenderMock).toHaveBeenCalledWith(
      testEmail,
      'raw-integration-test-token',
    );

    // Sending a verification email does not itself verify the account.
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      select: {
        status: true,
        emailVerifiedAt: true,
      },
    });

    expect(user).toMatchObject({
      status: 'PENDING',
      emailVerifiedAt: null,
    });
  });
});
