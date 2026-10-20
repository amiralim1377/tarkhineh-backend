import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import type {
  ClaimOutboundEmailMessagesInput,
  MarkOutboundEmailQueuedInput,
  OutboundEmailDispatchLane,
  OutboundEmailDispatchLease,
  OutboundEmailDispatchStore,
  ScheduleOutboundEmailDispatchRetryInput,
} from '../../application/ports/outbound-email-dispatch-store.port.js';

interface ClaimedOutboundEmailRow {
  messageId: string;
  lane: OutboundEmailDispatchLane;
  leaseToken: string;
  leaseUntil: Date;
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

        // Lock and claim eligible rows in one atomic database statement.
        // SKIP LOCKED lets independent dispatcher instances claim other rows.
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
                  AND "availableAt" <= timezone('UTC', statement_timestamp())
                  AND (
                    "lockedUntil" IS NULL
                    OR "lockedUntil" <= timezone('UTC', statement_timestamp())
                  )
                )
                OR (
                  "status" = 'DISPATCHING'::"OutboundEmailStatus"
                  AND (
                    "lockedUntil" IS NULL
                    OR "lockedUntil" <= timezone('UTC', statement_timestamp())
                  )
                )
              )
              AND (
                "validUntil" IS NULL
                OR "validUntil" > timezone('UTC', statement_timestamp())
              )
            ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
            LIMIT ${input.batchSize}
            FOR UPDATE SKIP LOCKED
          ),
          claimed AS (
            UPDATE public."OutboundEmailMessage" AS message
            SET
              "status" = 'DISPATCHING'::"OutboundEmailStatus",
              "lockedBy" = ${input.ownerPrefix} || ':' || gen_random_uuid()::text,
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

    if (input.lane !== 'TRANSACTIONAL' && input.lane !== 'BULK') {
      throw new TypeError('Dispatch lane is invalid.');
    }
  }

  private validateLeaseInput(messageId: string, leaseToken: string): void {
    if (!messageId.trim()) {
      throw new TypeError('Outbound email message ID must not be empty.');
    }

    if (!leaseToken.trim() || leaseToken.length > 200) {
      throw new TypeError('Outbound email lease token is invalid.');
    }
  }
}
