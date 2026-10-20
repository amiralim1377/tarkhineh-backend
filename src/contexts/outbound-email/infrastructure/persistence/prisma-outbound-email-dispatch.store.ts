import { Injectable } from '@nestjs/common';

import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

import type {
  ClaimOutboundEmailMessagesInput,
  FindStaleQueuedMessagesInput,
  MarkOutboundEmailQueuedInput,
  OutboundEmailDispatchLane,
  OutboundEmailDispatchLease,
  OutboundEmailDispatchStore,
  RecoverMissingQueuedJobInput,
  ScheduleOutboundEmailDispatchRetryInput,
  StaleQueuedOutboundEmailMessage,
} from '../../application/ports/outbound-email-dispatch-store.port.js';

interface ClaimedOutboundEmailRow {
  messageId: string;
  lane: OutboundEmailDispatchLane;
  leaseToken: string;
  leaseUntil: Date;
}

interface ReconciledOutboundEmailRow {
  messageId: string;
  lane: OutboundEmailDispatchLane;
  reconciledAt: Date;
}

@Injectable()
export class PrismaOutboundEmailDispatchStore implements OutboundEmailDispatchStore {
  constructor(private readonly prisma: PrismaService) {}

  async claimBatch(
    input: ClaimOutboundEmailMessagesInput,
  ): Promise<readonly OutboundEmailDispatchLease[]> {
    this.validateClaimInput(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Expire messages that can no longer be dispatched.
        // An active dispatcher lease is allowed to finish until it expires.
        await tx.$executeRaw`
          UPDATE public."OutboundEmailMessage"
          SET
            "status" = 'EXPIRED'::"OutboundEmailStatus",
            "encryptedPayload" = NULL,
            "lockedBy" = NULL,
            "lockedUntil" = NULL,
            "lastErrorCode" = 'MESSAGE_EXPIRED',
            "updatedAt" = timezone('UTC', clock_timestamp())
          WHERE
            "lane" = ${input.lane}::"OutboundEmailLane"
            AND "status" IN (
              'PENDING'::"OutboundEmailStatus",
              'DISPATCHING'::"OutboundEmailStatus",
              'QUEUED'::"OutboundEmailStatus",
              'RETRY_SCHEDULED'::"OutboundEmailStatus"
            )
            AND "validUntil" IS NOT NULL
            AND "validUntil" <= timezone('UTC', clock_timestamp())
            AND (
              "status" <> 'DISPATCHING'::"OutboundEmailStatus"
              OR "lockedUntil" IS NULL
              OR "lockedUntil" <= timezone('UTC', clock_timestamp())
            )
        `;

        // Atomically select and claim rows.
        // SKIP LOCKED lets concurrent dispatchers claim separate messages.
        const rows = await tx.$queryRaw<ClaimedOutboundEmailRow[]>`
          WITH candidates AS (
            SELECT "id"
            FROM public."OutboundEmailMessage"
            WHERE
              "lane" = ${input.lane}::"OutboundEmailLane"
              AND (
                (
                  "status" IN (
                    'PENDING'::"OutboundEmailStatus",
                    'RETRY_SCHEDULED'::"OutboundEmailStatus"
                  )
                  AND "availableAt" <= timezone(
                    'UTC',
                    statement_timestamp()
                  )
                  AND (
                    "lockedUntil" IS NULL
                    OR "lockedUntil" <= timezone(
                      'UTC',
                      statement_timestamp()
                    )
                  )
                )
                OR (
                  "status" = 'DISPATCHING'::"OutboundEmailStatus"
                  AND (
                    "lockedUntil" IS NULL
                    OR "lockedUntil" <= timezone(
                      'UTC',
                      statement_timestamp()
                    )
                  )
                )
              )
              AND (
                "validUntil" IS NULL
                OR "validUntil" > timezone(
                  'UTC',
                  statement_timestamp()
                )
              )
            ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
            LIMIT ${input.batchSize}
            FOR UPDATE SKIP LOCKED
          ),
          claimed AS (
            UPDATE public."OutboundEmailMessage" AS message
            SET
              "status" = 'DISPATCHING'::"OutboundEmailStatus",
              "lockedBy" =
                ${input.ownerPrefix} || ':' || gen_random_uuid()::text,
              "lockedUntil" =
                timezone('UTC', clock_timestamp())
                + (${input.leaseDurationMs} * INTERVAL '1 millisecond'),
              "dispatchAttempts" = message."dispatchAttempts" + 1,
              "updatedAt" = timezone('UTC', clock_timestamp())
            FROM candidates
            WHERE message."id" = candidates."id"
            RETURNING
              message."id" AS "messageId",
              message."lane" AS "lane",
              message."lockedBy" AS "leaseToken",
              message."lockedUntil" AS "leaseUntil"
          )
          SELECT "messageId", "lane", "leaseToken", "leaseUntil"
          FROM claimed
          ORDER BY "messageId" ASC
        `;

        return rows;
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async markQueued(input: MarkOutboundEmailQueuedInput): Promise<boolean> {
    this.validateLeaseInput(input.messageId, input.leaseToken);

    try {
      const affectedRows = await this.prisma.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "status" = 'QUEUED'::"OutboundEmailStatus",
          "enqueuedAt" = timezone('UTC', clock_timestamp()),
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = NULL,
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'DISPATCHING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
      `;

      return affectedRows === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async scheduleRetry(
    input: ScheduleOutboundEmailDispatchRetryInput,
  ): Promise<boolean> {
    this.validateLeaseInput(input.messageId, input.leaseToken);

    if (
      !Number.isSafeInteger(input.retryDelayMs) ||
      input.retryDelayMs < 1 ||
      input.retryDelayMs > 3_600_000
    ) {
      throw new RangeError('Dispatch retry delay is invalid.');
    }

    try {
      const affectedRows = await this.prisma.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "status" = 'RETRY_SCHEDULED'::"OutboundEmailStatus",
          "availableAt" =
            timezone('UTC', clock_timestamp())
            + (${input.retryDelayMs} * INTERVAL '1 millisecond'),
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = ${input.errorCode},
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'DISPATCHING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
      `;

      return affectedRows === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async findStaleQueuedMessages(
    input: FindStaleQueuedMessagesInput,
  ): Promise<readonly StaleQueuedOutboundEmailMessage[]> {
    this.validateReconciliationInput(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Select and mark candidates in the same transaction.
        // The persisted timestamp prevents repeatedly scanning the same
        // healthy messages during the reconciliation cooldown.
        const rows = await tx.$queryRaw<ReconciledOutboundEmailRow[]>`
          WITH candidates AS (
            SELECT "id"
            FROM public."OutboundEmailMessage"
            WHERE
              "lane" = ${input.lane}::"OutboundEmailLane"
              AND "status" = 'QUEUED'::"OutboundEmailStatus"
              AND "startedAt" IS NULL
              AND "enqueuedAt" IS NOT NULL
              AND "enqueuedAt" <= ${input.queuedBefore}
              AND (
                "lastReconciledAt" IS NULL
                OR "lastReconciledAt" <= ${input.reconciledBefore}
              )
              AND (
                "validUntil" IS NULL
                OR "validUntil" > ${input.now}
              )
            ORDER BY
              "lastReconciledAt" ASC NULLS FIRST,
              "enqueuedAt" ASC,
              "id" ASC
            LIMIT ${input.batchSize}
            FOR UPDATE SKIP LOCKED
          ),
          marked AS (
            UPDATE public."OutboundEmailMessage" AS message
            SET
              "lastReconciledAt" =
                timezone('UTC', statement_timestamp()),
              "updatedAt" =
                timezone('UTC', statement_timestamp())
            FROM candidates
            WHERE
              message."id" = candidates."id"
              AND message."status" = 'QUEUED'::"OutboundEmailStatus"
              AND message."startedAt" IS NULL
            RETURNING
              message."id" AS "messageId",
              message."lane" AS "lane",
              message."lastReconciledAt" AS "reconciledAt"
          )
          SELECT "messageId", "lane", "reconciledAt"
          FROM marked
        `;

        return rows;
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async recoverMissingQueuedJob(
    input: RecoverMissingQueuedJobInput,
  ): Promise<boolean> {
    this.validateRecoveryInput(input);

    try {
      const result = await this.prisma.outboundEmailMessage.updateMany({
        where: {
          id: input.messageId,
          lane: input.lane,
          status: 'QUEUED',
          startedAt: null,
          enqueuedAt: {
            not: null,
            lte: input.queuedBefore,
          },
          lastReconciledAt: input.reconciledAt,
          OR: [{ validUntil: null }, { validUntil: { gt: input.now } }],
        },
        data: {
          status: 'RETRY_SCHEDULED',
          availableAt: input.retryAt,
          enqueuedAt: null,
          lockedBy: null,
          lockedUntil: null,
          lastErrorCode: 'QUEUE_JOB_MISSING',
        },
      });

      return result.count === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private validateClaimInput(input: ClaimOutboundEmailMessagesInput): void {
    if (
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 500
    ) {
      throw new RangeError('Dispatch batch size is invalid.');
    }

    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < 1_000 ||
      input.leaseDurationMs > 300_000
    ) {
      throw new RangeError('Dispatch lease duration is invalid.');
    }

    if (
      !input.ownerPrefix.trim() ||
      input.ownerPrefix.length > 100 ||
      !/^[A-Za-z0-9_.:-]+$/.test(input.ownerPrefix)
    ) {
      throw new TypeError('Dispatch owner prefix is invalid.');
    }

    this.validateLane(input.lane);
  }

  private validateLeaseInput(messageId: string, leaseToken: string): void {
    if (!messageId.trim()) {
      throw new TypeError('Outbound email message ID must not be empty.');
    }

    if (!leaseToken.trim() || leaseToken.length > 200) {
      throw new TypeError('Outbound email lease token is invalid.');
    }
  }

  private validateReconciliationInput(
    input: FindStaleQueuedMessagesInput,
  ): void {
    if (
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 500
    ) {
      throw new RangeError('Reconciliation batch size is invalid.');
    }

    this.validateLane(input.lane);

    if (
      !Number.isFinite(input.queuedBefore.getTime()) ||
      !Number.isFinite(input.now.getTime()) ||
      input.queuedBefore > input.now
    ) {
      throw new RangeError('Reconciliation timestamps are invalid.');
    }

    if (
      !Number.isFinite(input.reconciledBefore.getTime()) ||
      input.reconciledBefore > input.now
    ) {
      throw new RangeError('Reconciliation cutoff is invalid.');
    }
  }

  private validateRecoveryInput(input: RecoverMissingQueuedJobInput): void {
    if (!input.messageId.trim()) {
      throw new TypeError('Outbound email message ID must not be empty.');
    }

    this.validateLane(input.lane);

    if (
      !Number.isFinite(input.queuedBefore.getTime()) ||
      !Number.isFinite(input.reconciledAt.getTime()) ||
      !Number.isFinite(input.now.getTime()) ||
      input.queuedBefore > input.now ||
      input.reconciledAt > input.now
    ) {
      throw new RangeError('Reconciliation timestamps are invalid.');
    }

    if (
      !Number.isFinite(input.retryAt.getTime()) ||
      input.retryAt <= input.now
    ) {
      throw new RangeError('Reconciliation retry time is invalid.');
    }
  }

  private validateLane(lane: OutboundEmailDispatchLane): void {
    if (lane !== 'TRANSACTIONAL' && lane !== 'BULK') {
      throw new TypeError('Outbound email lane is invalid.');
    }
  }
}
