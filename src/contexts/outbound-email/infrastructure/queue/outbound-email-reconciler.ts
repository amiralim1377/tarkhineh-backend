import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import {
  OUTBOUND_EMAIL_DISPATCH_STORE,
  type OutboundEmailDispatchLane,
  type OutboundEmailDispatchStore,
  type StaleQueuedOutboundEmailMessage,
} from '../../application/ports/outbound-email-dispatch-store.port.js';

const RECONCILE_INTERVAL_MS = 30_000;
const STALE_QUEUE_GRACE_MS = 120_000;
const RECONCILE_COOLDOWN_MS = 120_000;
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
    // Prevent overlapping timer executions in this process.
    // Database locking and conditional updates provide cross-instance safety.
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.reconcileLane('TRANSACTIONAL', this.transactionalQueue);

      // A failure in one lane must not prevent reconciliation of the other.
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

    const reconciledBefore = new Date(
      scanTime.getTime() - RECONCILE_COOLDOWN_MS,
    );

    let candidates: readonly StaleQueuedOutboundEmailMessage[];

    try {
      candidates = await this.dispatchStore.findStaleQueuedMessages({
        lane,
        batchSize: RECONCILE_BATCH_SIZE,
        queuedBefore,
        reconciledBefore,
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
      const jobId = `${JOB_ID_PREFIX}${candidate.messageId}`;

      let jobExists: boolean;

      try {
        const job = await queue.getJob(jobId);
        jobExists = job !== undefined && job !== null;
      } catch (error: unknown) {
        // A Redis error is not proof that a job is missing.
        // Do not recover this candidate or continue querying this lane.
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

      if (jobExists) {
        // Leave the database state unchanged when the job still exists.
        // The Worker owns delivery-state transitions.
        continue;
      }

      const recoveryTime = new Date();

      try {
        const recovered = await this.dispatchStore.recoverMissingQueuedJob({
          messageId: candidate.messageId,
          lane,
          queuedBefore,
          reconciledAt: candidate.reconciledAt,
          now: recoveryTime,
          retryAt: new Date(recoveryTime.getTime() + RETRY_DELAY_MS),
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
        // Do not modify state optimistically when persistence fails.
        // A later reconciliation pass can retry the operation.
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
