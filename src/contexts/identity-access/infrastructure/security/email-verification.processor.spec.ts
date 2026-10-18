import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { EmailTokenEncryptor } from '../../application/ports/email-token-encryptor.port.js';
import type { EmailVerificationSender } from '../../application/ports/email-verification-sender.port.js';
import { EmailVerificationProcessor } from './email-verification.processor.js';

type TestJobData = {
  outboxMessageId: string;
};

type TestMessage = {
  id: string;
  status: 'PENDING' | 'QUEUED' | 'SENT' | 'DEAD' | 'CANCELLED';
  encryptedToken: string | null;
  challenge: {
    email: string;
    expiresAt: Date;
    consumedAt: Date | null;
  };
};

function createMessage(overrides: Partial<TestMessage> = {}): TestMessage {
  return {
    id: 'outbox-123',
    status: 'QUEUED',
    encryptedToken: 'v1:encrypted-payload',
    challenge: {
      email: 'customer@example.com',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      consumedAt: null,
    },
    ...overrides,
  };
}

function createHarness(message: TestMessage | null = createMessage()) {
  const prisma = {
    emailOutboxMessage: {
      findUnique: vi.fn().mockResolvedValue(message),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const tokenEncryptor = {
    decrypt: vi.fn().mockReturnValue('raw-test-token'),
  } as unknown as EmailTokenEncryptor;

  const emailSender = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmailVerificationSender;

  // Keep a direct reference to the Vitest mock so its calls can be inspected.
  const loggerError = vi.fn();

  const logger = {
    setContext: vi.fn(),
    error: loggerError,
  } as unknown as PinoLogger;

  const processor = new EmailVerificationProcessor(
    prisma,
    tokenEncryptor,
    emailSender,
    logger,
  );

  return {
    prisma,
    tokenEncryptor,
    emailSender,
    logger,
    loggerError,
    processor,
  };
}

function createJob(attemptsMade = 0): Job<TestJobData> {
  return {
    name: 'send-verification-email',
    data: {
      outboxMessageId: 'outbox-123',
    },
    opts: {
      attempts: 5,
    },
    attemptsMade,
  } as unknown as Job<TestJobData>;
}

describe('EmailVerificationProcessor', () => {
  it('sends the verification email and marks the outbox message as sent', async () => {
    const { prisma, tokenEncryptor, emailSender, processor } = createHarness();

    await processor.process(createJob());

    expect(tokenEncryptor.decrypt).toHaveBeenCalledWith('v1:encrypted-payload');

    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'raw-test-token',
    );

    expect(prisma.emailOutboxMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-123',
        status: {
          in: ['PENDING', 'QUEUED'],
        },
      },
      data: {
        status: 'SENT',
        sentAt: expect.any(Date),
        attempts: {
          increment: 1,
        },
        lastErrorCode: null,
        encryptedToken: null,
      },
    });
  });

  it('does not send an email for a cancelled message', async () => {
    const { prisma, tokenEncryptor, emailSender, processor } = createHarness({
      ...createMessage(),
      status: 'CANCELLED',
      encryptedToken: null,
    });

    await processor.process(createJob());

    expect(tokenEncryptor.decrypt).not.toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();
    expect(prisma.emailOutboxMessage.updateMany).not.toHaveBeenCalled();
  });

  it('cancels an expired challenge without sending an email', async () => {
    const { prisma, tokenEncryptor, emailSender, processor } = createHarness({
      ...createMessage(),
      challenge: {
        email: 'customer@example.com',
        expiresAt: new Date(Date.now() - 60_000),
        consumedAt: null,
      },
    });

    await processor.process(createJob());

    expect(tokenEncryptor.decrypt).not.toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();

    expect(prisma.emailOutboxMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-123',
        status: {
          in: ['PENDING', 'QUEUED'],
        },
      },
      data: {
        status: 'CANCELLED',
        encryptedToken: null,
      },
    });
  });

  it('keeps the message queued when an attempt fails and retries remain', async () => {
    const { prisma, emailSender, loggerError, processor } = createHarness();

    vi.mocked(emailSender.sendVerificationEmail).mockRejectedValueOnce(
      new Error('Sensitive SMTP diagnostic'),
    );

    await expect(processor.process(createJob(0))).rejects.toThrow(
      'Email verification delivery failed',
    );

    expect(prisma.emailOutboxMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-123',
        status: {
          in: ['PENDING', 'QUEUED'],
        },
      },
      data: {
        attempts: {
          increment: 1,
        },
        lastErrorCode: 'EMAIL_DELIVERY_FAILED',
        status: 'QUEUED',
      },
    });

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: 'outbox-123',
        errorType: 'Error',
        attempt: 1,
      }),
      'Email verification delivery failed',
    );

    // The raw SMTP diagnostic must not be written to logs.
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(
      'Sensitive SMTP diagnostic',
    );
  });

  it('marks the message dead and clears the encrypted token on the final failed attempt', async () => {
    const { prisma, emailSender, processor } = createHarness();

    vi.mocked(emailSender.sendVerificationEmail).mockRejectedValueOnce(
      new Error('SMTP unavailable'),
    );

    await expect(processor.process(createJob(4))).rejects.toThrow(
      'Email verification delivery failed',
    );

    expect(prisma.emailOutboxMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-123',
        status: {
          in: ['PENDING', 'QUEUED'],
        },
      },
      data: {
        attempts: {
          increment: 1,
        },
        lastErrorCode: 'EMAIL_DELIVERY_FAILED',
        status: 'DEAD',
        encryptedToken: null,
      },
    });
  });
});
