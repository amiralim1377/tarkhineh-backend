import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import {
  OUTBOUND_EMAIL_DISPATCH_STORE,
  type OutboundEmailDispatchLane,
  type OutboundEmailDispatchStore,
} from '../../application/ports/outbound-email-dispatch-store.port.js';

const RECONCILE_INTERVAL_MS = 30_000;
const STALE_QUEUE_GRACE_MS = 120_000;
const RECONCILE_BATCH_SIZE = 100;
const RETRY_DELAY_MS = 5_000;
const JOB_ID_PREFIX = 'outbound-email-';

@Injectable()
export class OutboundEmailReconciler {
  private isRunning = false;

  constructor(
    @Inject(OUTBOUND_EMAIL_DISPATCH_STORE)
    private readonly dispatchStore: OutboundEmailDispatchStore,
    @InjectQueue('email-transactional')
    private readonly transactionalQueue: Queue,
    @InjectQueue('email-bulk')
    private readonly bulkQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboundEmailReconciler.name);
  }

  @Interval(RECONCILE_INTERVAL_MS)
  async reconcileStaleQueuedMessages(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.reconcileLane('TRANSACTIONAL', this.transactionalQueue);

      // A problem in one lane must not prevent checking the other lane.
      await this.reconcileLane('BULK', this.bulkQueue);
    } finally {
      this.isRunning = false;
    }
  }

  private async reconcileLane(
    lane: OutboundEmailDispatchLane,
    queue: Queue,
  ): Promise<void> {
    const scanTime = new Date();
    const queuedBefore = new Date(scanTime.getTime() - STALE_QUEUE_GRACE_MS);

    let candidates;

    try {
      candidates = await this.dispatchStore.findStaleQueuedMessages({
        lane,
        batchSize: RECONCILE_BATCH_SIZE,
        queuedBefore,
        now: scanTime,
      });
    } catch (error: unknown) {
      this.logger.error(
        {
          lane,
          errorType: this.getSafeErrorType(error),
        },
        'Failed to read stale outbound email messages',
      );

      return;
    }

    for (const candidate of candidates) {
      let job;

      try {
        job = await queue.getJob(`${JOB_ID_PREFIX}${candidate.messageId}`);
      } catch (error: unknown) {
        // A Redis read failure is not evidence that a Job is missing.
        // Stop this lane's scan without recovering any more messages.
        this.logger.error(
          {
            lane,
            outboxMessageId: candidate.messageId,
            errorType: this.getSafeErrorType(error),
          },
          'Unable to verify outbound email Job existence',
        );

        return;
      }

      if (job !== undefined && job !== null) {
        continue;
      }

      const now = new Date();

      try {
        const recovered = await this.dispatchStore.recoverMissingQueuedJob({
          messageId: candidate.messageId,
          lane,
          queuedBefore,
          now,
          retryAt: new Date(now.getTime() + RETRY_DELAY_MS),
        });

        if (recovered) {
          this.logger.warn(
            {
              lane,
              outboxMessageId: candidate.messageId,
              recoveryCode: 'QUEUE_JOB_MISSING',
            },
            'Recovered an outbound email message with a missing Queue Job',
          );
        }
      } catch (error: unknown) {
        this.logger.error(
          {
            lane,
            outboxMessageId: candidate.messageId,
            errorType: this.getSafeErrorType(error),
          },
          'Failed to persist missing outbound email Job recovery',
        );
      }
    }
  }

  private getSafeErrorType(error: unknown): string {
    return error instanceof Error &&
      /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
      ? error.name
      : 'UnknownError';
  }
}
