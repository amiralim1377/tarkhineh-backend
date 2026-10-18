import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import {
  EMAIL_TOKEN_ENCRYPTOR,
  type EmailTokenEncryptor,
} from '../../application/ports/email-token-encryptor.port.js';
import {
  EMAIL_VERIFICATION_SENDER,
  type EmailVerificationSender,
} from '../../application/ports/email-verification-sender.port.js';

interface EmailVerificationJob {
  outboxMessageId: string;
}

@Processor('email-verification')
export class EmailVerificationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,

    @Inject(EMAIL_TOKEN_ENCRYPTOR)
    private readonly tokenEncryptor: EmailTokenEncryptor,

    @Inject(EMAIL_VERIFICATION_SENDER)
    private readonly emailSender: EmailVerificationSender,

    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(EmailVerificationProcessor.name);
  }

  async process(job: Job<EmailVerificationJob>): Promise<void> {
    if (job.name !== 'send-verification-email') {
      throw new Error('Unsupported email verification job');
    }

    const { outboxMessageId } = job.data;

    const message = await this.prisma.emailOutboxMessage.findUnique({
      where: { id: outboxMessageId },
      include: {
        challenge: {
          select: {
            email: true,
            expiresAt: true,
            consumedAt: true,
          },
        },
      },
    });

    if (!message) {
      return;
    }

    if (
      message.status === 'SENT' ||
      message.status === 'DEAD' ||
      message.status === 'CANCELLED'
    ) {
      return;
    }

    const challengeIsInvalid =
      message.challenge.consumedAt !== null ||
      message.challenge.expiresAt <= new Date();

    if (!message.encryptedToken || challengeIsInvalid) {
      await this.prisma.emailOutboxMessage.updateMany({
        where: {
          id: message.id,
          status: { in: ['PENDING', 'QUEUED'] },
        },
        data: {
          status: 'CANCELLED',
          encryptedToken: null,
        },
      });

      return;
    }

    try {
      const rawToken = this.tokenEncryptor.decrypt(message.encryptedToken);

      await this.emailSender.sendVerificationEmail(
        message.challenge.email,
        rawToken,
      );
    } catch (error: unknown) {
      const errorType =
        error instanceof Error &&
        /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
          ? error.name
          : 'UnknownError';

      const maxAttempts = Number(job.opts.attempts ?? 1);
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      this.logger.error(
        {
          outboxMessageId,
          errorType,
          attempt: job.attemptsMade + 1,
        },
        'Email verification delivery failed',
      );

      await this.prisma.emailOutboxMessage.updateMany({
        where: {
          id: message.id,
          status: { in: ['PENDING', 'QUEUED'] },
        },
        data: {
          attempts: { increment: 1 },
          lastErrorCode: 'EMAIL_DELIVERY_FAILED',
          status: isFinalAttempt ? 'DEAD' : 'QUEUED',
          ...(isFinalAttempt ? { encryptedToken: null } : {}),
        },
      });

      // Throw a generic error so BullMQ can retry without exposing
      // the SMTP provider's raw error message.
      throw new Error('Email verification delivery failed');
    }

    await this.prisma.emailOutboxMessage.updateMany({
      where: {
        id: message.id,
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        attempts: { increment: 1 },
        lastErrorCode: null,
        encryptedToken: null,
      },
    });
  }
}
