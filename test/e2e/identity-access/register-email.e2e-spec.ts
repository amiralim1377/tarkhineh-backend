import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
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

import { OUTBOUND_EMAIL_PROVIDER } from '../../../src/contexts/outbound-email/application/ports/outbound-email-provider.port.js';

import { OutboundEmailDispatcher } from '../../../src/contexts/outbound-email/infrastructure/queue/outbound-email-dispatcher.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBullMqPrefix = process.env.BULLMQ_PREFIX;
const originalRateLimitKeyPrefix =
  process.env.RATE_LIMIT_KEY_PREFIX;

const testBullMqPrefix = `tarkhineh-e2e-${randomUUID()}`;
const testRateLimitKeyPrefix =
  `tarkhineh-e2e-rate-limit-${randomUUID()}`;

function createTestDatabaseUrl(configuredUrl: string | undefined): string {
  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for E2E tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName === 'tarkhineh_test') {
    return url.toString();
  }

  if (databaseName !== 'tarkhineh_db') {
    throw new Error('Refusing to run E2E tests against an unexpected database');
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}

function restoreEnvironmentVariable(
  name: string,
  originalValue: string | undefined,
): void {
  if (originalValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = originalValue;
  }
}

async function clearTestRedisNamespace(prefix: string): Promise<void> {
  if (
    prefix !== testBullMqPrefix &&
    prefix !== testRateLimitKeyPrefix
  ) {
    throw new Error(
      'Refusing to clean an unrecognized E2E Redis namespace.',
    );
  }

  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    connectTimeout: 1_000,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();

    let cursor = '0';
    const pattern = `${prefix}:*`;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );

      for (let index = 0; index < keys.length; index += 100) {
        const batch = keys.slice(index, index + 100);

        if (batch.length > 0) {
          await redis.unlink(...batch);
        }
      }

      cursor = nextCursor;
    } while (cursor !== '0');
  } finally {
    if (redis.status === 'ready') {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    } else {
      redis.disconnect();
    }
  }
}

describe('Email registration flow (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let dispatcher: OutboundEmailDispatcher;

  const testEmails = new Set<string>();

  const outboundEmailProviderMock = {
    send: vi.fn().mockResolvedValue({
      providerMessageId: 'e2e-provider-message-id',
    }),
  };

  beforeAll(async () => {
    // Restrict all database writes to the isolated test database.
    process.env.DATABASE_URL = createTestDatabaseUrl(originalDatabaseUrl);

    // Use a unique BullMQ namespace for this E2E test run.
    // Set it before importing AppModule because its configuration
    // is evaluated when the module is imported.
    process.env.BULLMQ_PREFIX = testBullMqPrefix;
    process.env.RATE_LIMIT_KEY_PREFIX = testRateLimitKeyPrefix;

    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OUTBOUND_EMAIL_PROVIDER)
      .useValue(outboundEmailProviderMock)
      .compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);

    dispatcher = app.get(OutboundEmailDispatcher, {
      strict: false,
    });
  });

  afterEach(async () => {
    try {
      if (testEmails.size > 0) {
        await prisma.user.deleteMany({
          where: {
            email: {
              in: [...testEmails],
            },
          },
        });

        testEmails.clear();
      }
    } finally {
      try {
        await clearTestRedisNamespace(testRateLimitKeyPrefix);
      } finally {
        outboundEmailProviderMock.send.mockClear();
      }
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      try {
        await clearTestRedisNamespace(testBullMqPrefix);
      } finally {
        try {
          await clearTestRedisNamespace(testRateLimitKeyPrefix);
        } finally {
          restoreEnvironmentVariable(
            'DATABASE_URL',
            originalDatabaseUrl,
          );
          restoreEnvironmentVariable(
            'BULLMQ_PREFIX',
            originalBullMqPrefix,
          );
          restoreEnvironmentVariable(
            'RATE_LIMIT_KEY_PREFIX',
            originalRateLimitKeyPrefix,
          );
        }
      }
    }
  });

  async function waitForOutboxToBeAccepted(
    outboxMessageId: string,
  ): Promise<void> {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      const message = await prisma.outboundEmailMessage.findUnique({
        where: { id: outboxMessageId },
        select: { status: true },
      });

      if (message?.status === 'ACCEPTED') {
        return;
      }

      if (
        message?.status === 'DEAD' ||
        message?.status === 'CANCELLED' ||
        message?.status === 'EXPIRED' ||
        message?.status === 'OUTCOME_UNKNOWN'
      ) {
        throw new Error(
          `Outbound email message reached unexpected status: ${message.status}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(
      'Timed out waiting for the outbound email message to be accepted',
    );
  }

  it('registers a user, processes the email job, and verifies the account over HTTP', async () => {
    const email = `register-e2e-${randomUUID()}@example.com`;

    testEmails.add(email);

    // 1. Register through the real HTTP endpoint.
    const registrationResponse = await request(app!.getHttpServer())
      .post('/auth/register/email')
      .send({
        email,
        password: 'Integration-Test-Password-123!',
        displayName: 'E2E Registration Test',
      })
      .expect(202);

    expect(registrationResponse.body).toMatchObject({
      message:
        'If this email can be registered, a verification email will be sent.',
    });

    // 2. Check that the real registration flow persisted the user.
    const userAfterRegistration = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        status: true,
        emailVerifiedAt: true,
        passwordHash: true,
      },
    });

    expect(userAfterRegistration).toMatchObject({
      status: 'PENDING',
      emailVerifiedAt: null,
    });

    expect(userAfterRegistration?.passwordHash).not.toBe(
      'Integration-Test-Password-123!',
    );

    // 3. Find the verification challenge and associated Outbox message.
    const challenge = await prisma.emailVerificationChallenge.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        consumedAt: true,
      },
    });

    if (!challenge) {
      throw new Error(
        'Expected registration to create a verification challenge',
      );
    }

    const outboxMessage = await prisma.outboundEmailMessage.findFirst({
      where: {
        aggregateType: 'EmailVerificationChallenge',
        aggregateId: challenge.id,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
      },
    });

    if (!outboxMessage) {
      throw new Error(
        'Expected registration to create an outbound email message',
      );
    }

    const outboxMessageId = outboxMessage.id;

    // 4. Dispatch the persisted Outbox message to the real BullMQ queue.
    await dispatcher.dispatchAvailableMessages();

    // 5. Wait until the real Worker finishes processing the message.
    // The email sender is mocked, so no real email is sent.
    await waitForOutboxToBeAccepted(outboxMessageId);

    const callsForThisEmail = outboundEmailProviderMock.send.mock.calls.filter(
      ([content]) => content.to === email,
    );

    expect(callsForThisEmail).toHaveLength(1);

    const providerCall = callsForThisEmail[0];

    if (!providerCall) {
      throw new Error('The Provider mock did not receive the email content');
    }

    // Find the token in the rendered email and match it against the stored
    // challenge hash. This verifies the token that the Provider was given.
    const renderedContent = JSON.stringify(providerCall[0]);
    const rawToken = renderedContent
      .match(/[A-Za-z0-9_-]{32,128}/g)
      ?.find(
        (candidate) =>
          createHash('sha256').update(candidate).digest('hex') ===
          challenge.tokenHash,
      );

    if (!rawToken) {
      throw new Error(
        'The rendered email did not contain the challenge verification token',
      );
    }

    // 6. Confirm that the emailed raw token matches the stored hash.
    expect(createHash('sha256').update(rawToken).digest('hex')).toBe(
      challenge.tokenHash,
    );

    const acceptedOutbox = await prisma.outboundEmailMessage.findUnique({
      where: { id: outboxMessageId },
      select: {
        status: true,
        dispatchAttempts: true,
        deliveryAttempts: true,
        sentAt: true,
        encryptedPayload: true,
        providerMessageId: true,
      },
    });

    expect(acceptedOutbox).toMatchObject({
      status: 'ACCEPTED',
      dispatchAttempts: 1,
      deliveryAttempts: 1,
      sentAt: expect.any(Date),
      encryptedPayload: null,
      providerMessageId: 'e2e-provider-message-id',
    });

    // 7. Submit the token through the real HTTP verification endpoint.
    const verificationResponse = await request(app!.getHttpServer())
      .post('/auth/verify-email')
      .send({
        token: rawToken,
      })
      .expect(200);

    expect(verificationResponse.body).toMatchObject({
      message: 'Email verified successfully.',
    });

    // 8. Verify the final account and challenge state in PostgreSQL.
    const verifiedUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        status: true,
        emailVerifiedAt: true,
      },
    });

    expect(verifiedUser).toMatchObject({
      status: 'ACTIVE',
      emailVerifiedAt: expect.any(Date),
    });

    const verifiedChallenge =
      await prisma.emailVerificationChallenge.findUnique({
        where: {
          tokenHash: challenge.tokenHash,
        },
        select: {
          consumedAt: true,
        },
      });

    expect(verifiedChallenge?.consumedAt).toBeInstanceOf(Date);
  }, 20_000);
});
