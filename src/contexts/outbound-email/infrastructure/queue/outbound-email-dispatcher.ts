import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import {
  OUTBOUND_EMAIL_DISPATCH_STORE,
  type OutboundEmailDispatchLane,
  type OutboundEmailDispatchLease,
  type OutboundEmailDispatchStore,
} from '../../application/ports/outbound-email-dispatch-store.port.js';

const BATCH_SIZE = 50;
const LEASE_DURATION_MS = 60_000;
const DISPATCH_INTERVAL_MS = 5_000;
const ENQUEUE_RETRY_DELAY_MS = 5_000;
const JOB_NAME = 'deliver-outbound-email';

@Injectable()
export class OutboundEmailDispatcher {
  private isRunning = false;

  private readonly ownerPrefix = `outbound-email-dispatcher-${randomUUID()}`;

  constructor(
    @Inject(OUTBOUND_EMAIL_DISPATCH_STORE)
    private readonly dispatchStore: OutboundEmailDispatchStore,
    @InjectQueue('email-transactional')
    private readonly transactionalQueue: Queue,
    @InjectQueue('email-bulk')
    private readonly bulkQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboundEmailDispatcher.name);
  }

  @Interval(DISPATCH_INTERVAL_MS)
  async dispatchAvailableMessages(): Promise<void> {
    // This guard prevents overlapping timer executions in this process.
    // PostgreSQL leases, not this local flag, provide cross-instance safety.
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.dispatchLane('TRANSACTIONAL', this.transactionalQueue);

      // Process BULK independently, even when the other lane encounters
      // a database or Redis error.
      await this.dispatchLane('BULK', this.bulkQueue);
    } finally {
      this.isRunning = false;
    }
  }

  private async dispatchLane(
    lane: OutboundEmailDispatchLane,
    queue: Queue,
  ): Promise<void> {
    let leases: readonly OutboundEmailDispatchLease[];

    try {
      leases = await this.dispatchStore.claimBatch({
        lane,
        batchSize: BATCH_SIZE,
        leaseDurationMs: LEASE_DURATION_MS,
        ownerPrefix: this.ownerPrefix,
      });
    } catch (error: unknown) {
      this.logger.error(
        {
          lane,
          errorType: this.getSafeErrorType(error),
        },
        'Failed to claim outbound email messages',
      );

      return;
    }

    for (const lease of leases) {
      await this.dispatchLease(lease, queue);
    }
  }

  private async dispatchLease(
    lease: OutboundEmailDispatchLease,
    queue: Queue,
  ): Promise<void> {
    try {
      await queue.add(
        JOB_NAME,
        {
          outboundEmailMessageId: lease.messageId,
        },
        {
          // Stable IDs make repeated enqueue attempts for the same logical
          // message idempotent while the corresponding BullMQ job exists.
          // Worker-side database state checks and reconciliation are still
          // required; this is not an exactly-once delivery guarantee.
          jobId: `outbound-email-${lease.messageId}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (enqueueError: unknown) {
      this.logger.error(
        {
          outboxMessageId: lease.messageId,
          lane: lease.lane,
          errorType: this.getSafeErrorType(enqueueError),
        },
        'Failed to enqueue outbound email message',
      );

      // Enqueue errors may be ambiguous: Redis might have accepted the job
      // before the connection failed. The stable Job ID and later
      // reconciliation help resolve this safely.
      try {
        const scheduled = await this.dispatchStore.scheduleRetry({
          messageId: lease.messageId,
          leaseToken: lease.leaseToken,
          retryDelayMs: ENQUEUE_RETRY_DELAY_MS,
          errorCode: 'QUEUE_ENQUEUE_FAILED',
        });

        if (!scheduled) {
          this.logger.warn(
            {
              outboxMessageId: lease.messageId,
              lane: lease.lane,
            },
            'Dispatch retry was not scheduled because lease ownership changed',
          );
        }
      } catch (retryError: unknown) {
        // Do not clear ownership optimistically. If persistence is
        // unavailable, the lease can expire and be recovered later.
        this.logger.error(
          {
            outboxMessageId: lease.messageId,
            lane: lease.lane,
            errorType: this.getSafeErrorType(retryError),
          },
          'Failed to persist outbound email dispatch retry',
        );
      }

      return;
    }

    try {
      const markedQueued = await this.dispatchStore.markQueued({
        messageId: lease.messageId,
        leaseToken: lease.leaseToken,
      });

      if (!markedQueued) {
        // A Worker or a newer lease may have changed the message already.
        // Never overwrite that newer state.
        this.logger.warn(
          {
            outboxMessageId: lease.messageId,
            lane: lease.lane,
          },
          'Outbound email state was not changed because the lease is no longer current',
        );
      }
    } catch (error: unknown) {
      // The Redis job may exist even though this database update failed.
      // Leave recovery to the expiring lease and reconciliation process.
      this.logger.error(
        {
          outboxMessageId: lease.messageId,
          lane: lease.lane,
          errorType: this.getSafeErrorType(error),
        },
        'Failed to persist outbound email queued state',
      );
    }
  }

  private getSafeErrorType(error: unknown): string {
    return error instanceof Error &&
      /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
      ? error.name
      : 'UnknownError';
  }
}
