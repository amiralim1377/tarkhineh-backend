import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

import { EMAIL_VERIFICATION_SENDER } from '../../../src/contexts/identity-access/application/ports/email-verification-sender.port.js';

import { EmailOutboxDispatcher } from '../../../src/contexts/identity-access/infrastructure/queue/email-outbox-dispatcher.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBullMqPrefix = process.env.BULLMQ_PREFIX;

const testBullMqPrefix = `tarkhineh-e2e-${randomUUID()}`;

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

describe('Email registration flow (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let dispatcher: EmailOutboxDispatcher;

  const testEmails = new Set<string>();

  const emailSenderMock = vi
    .fn<(email: string, rawToken: string) => Promise<void>>()
    .mockResolvedValue(undefined);

  beforeAll(async () => {
    // Restrict all database writes to the isolated test database.
    process.env.DATABASE_URL = createTestDatabaseUrl(originalDatabaseUrl);

    // Use a unique BullMQ namespace for this E2E test run.
    // Set it before importing AppModule because its configuration
    // is evaluated when the module is imported.
    process.env.BULLMQ_PREFIX = testBullMqPrefix;

    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_VERIFICATION_SENDER)
      .useValue({
        sendVerificationEmail: emailSenderMock,
      })
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

    dispatcher = app.get(EmailOutboxDispatcher, {
      strict: false,
    });
  });

  afterEach(async () => {
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

    emailSenderMock.mockClear();
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      // Restore environment variables even if application shutdown fails.
      restoreEnvironmentVariable('DATABASE_URL', originalDatabaseUrl);

      restoreEnvironmentVariable('BULLMQ_PREFIX', originalBullMqPrefix);
    }
  });

  async function waitForOutboxToBeSent(outboxMessageId: string): Promise<void> {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      const message = await prisma.emailOutboxMessage.findUnique({
        where: {
          id: outboxMessageId,
        },
        select: {
          status: true,
        },
      });

      if (message?.status === 'SENT') {
        return;
      }

      if (message?.status === 'DEAD' || message?.status === 'CANCELLED') {
        throw new Error(
          `Email outbox message reached unexpected status: ${message.status}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(
      'Timed out waiting for the email outbox message to be sent',
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
      where: {
        email,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        tokenHash: true,
        consumedAt: true,
        outboxMessage: {
          select: {
            id: true,
          },
        },
      },
    });

    expect(challenge).not.toBeNull();

    if (!challenge?.outboxMessage) {
      throw new Error(
        'Expected registration to create an email outbox message',
      );
    }

    const outboxMessageId = challenge.outboxMessage.id;

    // 4. Dispatch the persisted Outbox message to the real BullMQ queue.
    await dispatcher.dispatchPendingMessages();

    // 5. Wait until the real Worker finishes processing the message.
    // The email sender is mocked, so no real email is sent.
    await waitForOutboxToBeSent(outboxMessageId);

    const callsForThisEmail = emailSenderMock.mock.calls.filter(
      ([recipient]) => recipient === email,
    );

    expect(callsForThisEmail).toHaveLength(1);

    const rawToken = callsForThisEmail[0]?.[1];

    if (!rawToken) {
      throw new Error(
        'The email sender mock did not receive a verification token',
      );
    }

    // 6. Confirm that the emailed raw token matches the stored hash.
    expect(createHash('sha256').update(rawToken).digest('hex')).toBe(
      challenge.tokenHash,
    );

    const sentOutbox = await prisma.emailOutboxMessage.findUnique({
      where: {
        id: outboxMessageId,
      },
      select: {
        status: true,
        attempts: true,
        sentAt: true,
        encryptedToken: true,
      },
    });

    expect(sentOutbox).toMatchObject({
      status: 'SENT',
      attempts: 1,
      sentAt: expect.any(Date),
      encryptedToken: null,
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
