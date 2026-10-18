import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../../../prisma/prisma.service.js';

const BATCH_SIZE = 50;
const DISPATCH_INTERVAL_MS = 5_000;
const JOB_NAME = 'send-verification-email';

@Injectable()
export class EmailOutboxDispatcher {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email-verification')
    private readonly emailQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailOutboxDispatcher.name);
  }

  @Interval(DISPATCH_INTERVAL_MS)
  async dispatchPendingMessages(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const messages = await this.prisma.emailOutboxMessage.findMany({
        where: {
          status: 'PENDING',
          availableAt: {
            lte: new Date(),
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: BATCH_SIZE,
        select: {
          id: true,
        },
      });

      for (const message of messages) {
        try {
          await this.emailQueue.add(
            JOB_NAME,
            {
              outboxMessageId: message.id,
            },
            {
              jobId: `email-verification-${message.id}`,
              attempts: 5,
              backoff: {
                type: 'exponential',
                delay: 1_000,
              },
              removeOnComplete: {
                age: 86_400,
                count: 1_000,
              },
              removeOnFail: {
                age: 604_800,
                count: 5_000,
              },
            },
          );

          await this.prisma.emailOutboxMessage.updateMany({
            where: {
              id: message.id,
              status: 'PENDING',
            },
            data: {
              status: 'QUEUED',
              enqueuedAt: new Date(),
            },
          });
        } catch (error: unknown) {
          const errorType =
            error instanceof Error &&
            /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
              ? error.name
              : 'UnknownError';

          this.logger.error(
            {
              outboxMessageId: message.id,
              errorType,
            },
            'Failed to dispatch email outbox message',
          );

          // The message remains pending if it could not be queued.
          // A later interval can retry it.
        }
      }
    } catch (error: unknown) {
      const errorType =
        error instanceof Error &&
        /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
          ? error.name
          : 'UnknownError';

      this.logger.error(
        { errorType },
        'Failed to read pending email outbox messages',
      );
    } finally {
      this.isRunning = false;
    }
  }
}
