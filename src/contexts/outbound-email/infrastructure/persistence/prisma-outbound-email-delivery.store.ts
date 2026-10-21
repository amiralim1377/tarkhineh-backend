import { Injectable } from '@nestjs/common';

import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

import type {
  ClaimOutboundEmailForDeliveryInput,
  ClaimedOutboundEmailDelivery,
  MarkOutboundEmailAcceptedInput,
  MarkOutboundEmailDeadInput,
  MarkOutboundEmailOutcomeUnknownInput,
  OutboundEmailDeliveryLane,
  OutboundEmailDeliveryStore,
  PrepareOutboundEmailDeliveryInput,
  PrepareOutboundEmailDeliveryResult,
  ScheduleOutboundEmailDeliveryRetryInput,
} from '../../application/ports/outbound-email-delivery-store.port.js';

interface ClaimedDeliveryRow {
  messageId: string;
  lane: OutboundEmailDeliveryLane;
  leaseToken: string;
  leaseUntil: Date;
  templateKey: string;
  payloadVersion: number;
  encryptedPayload: string | null;
  validUntil: Date | null;
}

interface DeliveryEligibilityRow {
  aggregateType: string | null;
  aggregateId: string | null;
}

interface PasswordResetChallengeEligibilityRow {
  consumed: boolean;
  invalidated: boolean;
  expired: boolean;
}

interface CountRow {
  count: number;
}

const MIN_LEASE_DURATION_MS = 1_000;
const MAX_LEASE_DURATION_MS = 300_000;
const MAX_RETRY_DELAY_MS = 3_600_000;
const MAX_BATCH_SIZE = 500;

@Injectable()
export class PrismaOutboundEmailDeliveryStore implements OutboundEmailDeliveryStore {
  constructor(private readonly prisma: PrismaService) {}

  async claimForDelivery(
    input: ClaimOutboundEmailForDeliveryInput,
  ): Promise<ClaimedOutboundEmailDelivery | null> {
    this.validateClaimInput(input);

    try {
      const rows = await this.prisma.$queryRaw<ClaimedDeliveryRow[]>`
        WITH expired AS (
          UPDATE public."OutboundEmailMessage"
          SET
            "status" = 'EXPIRED'::"OutboundEmailStatus",
            "encryptedPayload" = NULL,
            "lockedBy" = NULL,
            "lockedUntil" = NULL,
            "lastErrorCode" = 'MESSAGE_EXPIRED',
            "updatedAt" = timezone('UTC', clock_timestamp())
          WHERE
            "id" = ${input.messageId}
            AND "lane" = ${input.lane}::"OutboundEmailLane"
            AND "status" IN (
              'PENDING'::"OutboundEmailStatus",
              'DISPATCHING'::"OutboundEmailStatus",
              'QUEUED'::"OutboundEmailStatus",
              'RETRY_SCHEDULED'::"OutboundEmailStatus"
            )
            AND "validUntil" IS NOT NULL
            AND "validUntil" <= timezone('UTC', clock_timestamp())
          RETURNING "id"
        ),
        claimed AS (
          UPDATE public."OutboundEmailMessage" AS message
          SET
            "status" = 'PROCESSING'::"OutboundEmailStatus",
            "lockedBy" =
              ${input.workerPrefix} || ':' || gen_random_uuid()::text,
            "lockedUntil" =
              timezone('UTC', clock_timestamp())
              + (${input.leaseDurationMs} * INTERVAL '1 millisecond'),
            "startedAt" = timezone('UTC', clock_timestamp()),
            "lastAttemptAt" = timezone('UTC', clock_timestamp()),
            "deliveryAttempts" = message."deliveryAttempts" + 1,
            "updatedAt" = timezone('UTC', clock_timestamp())
          WHERE
            message."id" = ${input.messageId}
            AND message."lane" = ${input.lane}::"OutboundEmailLane"
            AND (
              message."status" = 'QUEUED'::"OutboundEmailStatus"
              OR (
                message."status" = 'DISPATCHING'::"OutboundEmailStatus"
                AND message."lockedUntil" >
                  timezone('UTC', clock_timestamp())
              )
            )
            AND (
              message."validUntil" IS NULL
              OR message."validUntil" >
                timezone('UTC', clock_timestamp())
            )
          RETURNING
            message."id" AS "messageId",
            message."lane" AS "lane",
            message."lockedBy" AS "leaseToken",
            message."lockedUntil" AS "leaseUntil",
            message."templateKey" AS "templateKey",
            message."payloadVersion" AS "payloadVersion",
            message."encryptedPayload" AS "encryptedPayload",
            message."validUntil" AS "validUntil"
        )
        SELECT
          "messageId",
          "lane",
          "leaseToken",
          "leaseUntil",
          "templateKey",
          "payloadVersion",
          "encryptedPayload",
          "validUntil"
        FROM claimed
      `;

      return rows[0] ?? null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async prepareForDelivery(
    input: PrepareOutboundEmailDeliveryInput,
  ): Promise<PrepareOutboundEmailDeliveryResult> {
    this.validateLeaseInput(input.messageId, input.leaseToken);
    this.validateLeaseDuration(input.leaseDurationMs);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const messageRows = await tx.$queryRaw<DeliveryEligibilityRow[]>`
        SELECT
          "aggregateType",
          "aggregateId"
        FROM public."OutboundEmailMessage"
        WHERE
        "id" = ${input.messageId}
        AND "status" = 'PROCESSING'::"OutboundEmailStatus"
        AND "lockedBy" = ${input.leaseToken}
        AND "lockedUntil" > timezone('UTC', clock_timestamp())
      `;

        const message = messageRows[0];

        if (!message) {
          return 'LEASE_LOST';
        }

        let challenge: PasswordResetChallengeEligibilityRow | undefined;

        if (message.aggregateType === 'PasswordResetChallenge') {
          if (!message.aggregateId) {
            const cancelledRows = await tx.$executeRaw`
            UPDATE public."OutboundEmailMessage"
            SET
              "status" = 'CANCELLED'::"OutboundEmailStatus",
              "cancelledAt" = timezone('UTC', clock_timestamp()),
              "encryptedPayload" = NULL,
              "lockedBy" = NULL,
              "lockedUntil" = NULL,
              "lastErrorCode" = 'CHALLENGE_INELIGIBLE',
              "updatedAt" = timezone('UTC', clock_timestamp())
            WHERE
              "id" = ${input.messageId}
              AND "status" = 'PROCESSING'::"OutboundEmailStatus"
              AND "lockedBy" = ${input.leaseToken}
              AND "lockedUntil" > timezone('UTC', clock_timestamp())
          `;

            return cancelledRows === 1 ? 'CANCELLED' : 'LEASE_LOST';
          }

          const challengeOwnerRows = await tx.$queryRaw<
            Array<{ userId: string }>
          >`
          SELECT "userId"
          FROM public."PasswordResetChallenge"
          WHERE "id" = ${message.aggregateId}
        `;

          const challengeOwner = challengeOwnerRows[0];

          if (challengeOwner) {
            // Follow the same lock order as PasswordResetRequestStore:
            // lock User before changing or validating delivery state.
            await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM public."User"
            WHERE "id" = ${challengeOwner.userId}
            FOR UPDATE
          `;
          }

          const challengeRows = await tx.$queryRaw<
            PasswordResetChallengeEligibilityRow[]
          >`
            SELECT
              "consumedAt" IS NOT NULL AS "consumed",
              "invalidatedAt" IS NOT NULL AS "invalidated",
              "expiresAt" <= timezone('UTC', clock_timestamp()) AS "expired"
            FROM public."PasswordResetChallenge"
            WHERE "id" = ${message.aggregateId}
          `;

          challenge = challengeRows[0];
        }

        const expiredRows = await tx.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "status" = 'EXPIRED'::"OutboundEmailStatus",
          "encryptedPayload" = NULL,
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = 'MESSAGE_EXPIRED',
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'PROCESSING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
          AND "validUntil" IS NOT NULL
          AND "validUntil" <= timezone('UTC', clock_timestamp())
      `;

        if (expiredRows === 1) {
          return 'EXPIRED';
        }

        if (message.aggregateType === 'PasswordResetChallenge') {
          if (!challenge || challenge.consumed || challenge.invalidated) {
            const cancelledRows = await tx.$executeRaw`
            UPDATE public."OutboundEmailMessage"
            SET
              "status" = 'CANCELLED'::"OutboundEmailStatus",
              "cancelledAt" = timezone('UTC', clock_timestamp()),
              "encryptedPayload" = NULL,
              "lockedBy" = NULL,
              "lockedUntil" = NULL,
              "lastErrorCode" = 'CHALLENGE_INELIGIBLE',
              "updatedAt" = timezone('UTC', clock_timestamp())
            WHERE
              "id" = ${input.messageId}
              AND "status" = 'PROCESSING'::"OutboundEmailStatus"
              AND "lockedBy" = ${input.leaseToken}
              AND "lockedUntil" > timezone('UTC', clock_timestamp())
          `;

            return cancelledRows === 1 ? 'CANCELLED' : 'LEASE_LOST';
          }

          if (challenge.expired) {
            const expiredChallengeRows = await tx.$executeRaw`
            UPDATE public."OutboundEmailMessage"
            SET
              "status" = 'EXPIRED'::"OutboundEmailStatus",
              "encryptedPayload" = NULL,
              "lockedBy" = NULL,
              "lockedUntil" = NULL,
              "lastErrorCode" = 'CHALLENGE_EXPIRED',
              "updatedAt" = timezone('UTC', clock_timestamp())
            WHERE
              "id" = ${input.messageId}
              AND "status" = 'PROCESSING'::"OutboundEmailStatus"
              AND "lockedBy" = ${input.leaseToken}
              AND "lockedUntil" > timezone('UTC', clock_timestamp())
          `;

            return expiredChallengeRows === 1 ? 'EXPIRED' : 'LEASE_LOST';
          }
        }

        const preparedRows = await tx.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "lockedUntil" =
            timezone('UTC', clock_timestamp())
            + (${input.leaseDurationMs} * INTERVAL '1 millisecond'),
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'PROCESSING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
          AND (
            "validUntil" IS NULL
            OR "validUntil" > timezone('UTC', clock_timestamp())
          )
      `;

        return preparedRows === 1 ? 'READY' : 'LEASE_LOST';
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async markAccepted(input: MarkOutboundEmailAcceptedInput): Promise<boolean> {
    this.validateLeaseInput(input.messageId, input.leaseToken);
    this.validateProviderMessageId(input.providerMessageId);

    try {
      const affectedRows = await this.prisma.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "status" = 'ACCEPTED'::"OutboundEmailStatus",
          "sentAt" = timezone('UTC', clock_timestamp()),
          "providerMessageId" = ${input.providerMessageId},
          "encryptedPayload" = NULL,
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = NULL,
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'PROCESSING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
      `;

      return affectedRows === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async scheduleRetry(
    input: ScheduleOutboundEmailDeliveryRetryInput,
  ): Promise<boolean> {
    this.validateLeaseInput(input.messageId, input.leaseToken);
    this.validateRetryDelay(input.retryDelayMs);
    this.validateRetryErrorCode(input.errorCode);

    try {
      const affectedRows = await this.prisma.$executeRaw`
        WITH clock_now AS (
          SELECT timezone('UTC', clock_timestamp()) AS "now"
        )
        UPDATE public."OutboundEmailMessage" AS message
        SET
          "status" = CASE
            WHEN message."validUntil" IS NOT NULL
              AND message."validUntil" <= clock_now."now"
              THEN 'EXPIRED'::"OutboundEmailStatus"
            ELSE 'RETRY_SCHEDULED'::"OutboundEmailStatus"
          END,
          "availableAt" = CASE
            WHEN message."validUntil" IS NOT NULL
              AND message."validUntil" <= clock_now."now"
              THEN message."availableAt"
            ELSE clock_now."now"
              + (${input.retryDelayMs} * INTERVAL '1 millisecond')
          END,
          "encryptedPayload" = CASE
            WHEN message."validUntil" IS NOT NULL
              AND message."validUntil" <= clock_now."now"
              THEN NULL
            ELSE message."encryptedPayload"
          END,
          "startedAt" = NULL,
          "enqueuedAt" = NULL,
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = CASE
            WHEN message."validUntil" IS NOT NULL
              AND message."validUntil" <= clock_now."now"
              THEN 'MESSAGE_EXPIRED'
            ELSE ${input.errorCode}
          END,
          "updatedAt" = clock_now."now"
        FROM clock_now
        WHERE
          message."id" = ${input.messageId}
          AND message."status" = 'PROCESSING'::"OutboundEmailStatus"
          AND message."lockedBy" = ${input.leaseToken}
          AND message."lockedUntil" > clock_now."now"
      `;

      return affectedRows === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async markDead(input: MarkOutboundEmailDeadInput): Promise<boolean> {
    this.validateLeaseInput(input.messageId, input.leaseToken);
    this.validateDeadErrorCode(input.errorCode);

    try {
      const affectedRows = await this.prisma.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "status" = 'DEAD'::"OutboundEmailStatus",
          "failedAt" = timezone('UTC', clock_timestamp()),
          "encryptedPayload" = NULL,
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = ${input.errorCode},
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'PROCESSING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
      `;

      return affectedRows === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async markOutcomeUnknown(
    input: MarkOutboundEmailOutcomeUnknownInput,
  ): Promise<boolean> {
    this.validateLeaseInput(input.messageId, input.leaseToken);
    this.validateOutcomeUnknownErrorCode(input.errorCode);

    try {
      const affectedRows = await this.prisma.$executeRaw`
        UPDATE public."OutboundEmailMessage"
        SET
          "status" = 'OUTCOME_UNKNOWN'::"OutboundEmailStatus",
          "lockedBy" = NULL,
          "lockedUntil" = NULL,
          "lastErrorCode" = ${input.errorCode},
          "updatedAt" = timezone('UTC', clock_timestamp())
        WHERE
          "id" = ${input.messageId}
          AND "status" = 'PROCESSING'::"OutboundEmailStatus"
          AND "lockedBy" = ${input.leaseToken}
          AND "lockedUntil" > timezone('UTC', clock_timestamp())
      `;

      return affectedRows === 1;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async recoverExpiredProcessingMessages(batchSize: number): Promise<number> {
    this.validateBatchSize(batchSize);

    try {
      const rows = await this.prisma.$queryRaw<CountRow[]>`
        WITH clock_now AS (
          SELECT timezone('UTC', clock_timestamp()) AS "now"
        ),
        candidates AS (
          SELECT message."id"
          FROM public."OutboundEmailMessage" AS message
          CROSS JOIN clock_now
          WHERE
            message."status" = 'PROCESSING'::"OutboundEmailStatus"
            AND (
              message."lockedUntil" IS NULL
              OR message."lockedUntil" <= clock_now."now"
            )
          ORDER BY
            message."lockedUntil" ASC NULLS FIRST,
            message."createdAt" ASC,
            message."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF message SKIP LOCKED
        ),
        recovered AS (
          UPDATE public."OutboundEmailMessage" AS message
          SET
            "status" = 'OUTCOME_UNKNOWN'::"OutboundEmailStatus",
            "lockedBy" = NULL,
            "lockedUntil" = NULL,
            "lastErrorCode" = 'PROCESSING_LEASE_EXPIRED',
            "updatedAt" = timezone('UTC', clock_timestamp())
          FROM candidates
          WHERE
            message."id" = candidates."id"
            AND message."status" = 'PROCESSING'::"OutboundEmailStatus"
            AND (
              message."lockedUntil" IS NULL
              OR message."lockedUntil" <= timezone('UTC', clock_timestamp())
            )
          RETURNING message."id"
        )
        SELECT COUNT(*)::int AS "count"
        FROM recovered
      `;

      return rows[0]?.count ?? 0;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private validateClaimInput(input: ClaimOutboundEmailForDeliveryInput): void {
    this.validateMessageId(input.messageId);
    this.validateLane(input.lane);
    this.validateLeaseDuration(input.leaseDurationMs);

    if (
      !input.workerPrefix.trim() ||
      input.workerPrefix.length > 100 ||
      !/^[A-Za-z0-9_.:-]+$/.test(input.workerPrefix)
    ) {
      throw new TypeError('Outbound email worker prefix is invalid.');
    }
  }

  private validateLeaseDuration(leaseDurationMs: number): void {
    if (
      !Number.isSafeInteger(leaseDurationMs) ||
      leaseDurationMs < MIN_LEASE_DURATION_MS ||
      leaseDurationMs > MAX_LEASE_DURATION_MS
    ) {
      throw new RangeError('Outbound email delivery lease is invalid.');
    }
  }

  private validateRetryDelay(retryDelayMs: number): void {
    if (
      !Number.isSafeInteger(retryDelayMs) ||
      retryDelayMs < 1 ||
      retryDelayMs > MAX_RETRY_DELAY_MS
    ) {
      throw new RangeError('Outbound email delivery retry delay is invalid.');
    }
  }

  private validateBatchSize(batchSize: number): void {
    if (
      !Number.isSafeInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_BATCH_SIZE
    ) {
      throw new RangeError('Outbound email recovery batch size is invalid.');
    }
  }

  private validateMessageId(messageId: string): void {
    if (!messageId.trim() || messageId.length > 200) {
      throw new TypeError('Outbound email message ID is invalid.');
    }
  }

  private validateLeaseInput(messageId: string, leaseToken: string): void {
    this.validateMessageId(messageId);

    if (!leaseToken.trim() || leaseToken.length > 200) {
      throw new TypeError('Outbound email lease token is invalid.');
    }
  }

  private validateLane(lane: OutboundEmailDeliveryLane): void {
    if (lane !== 'TRANSACTIONAL' && lane !== 'BULK') {
      throw new TypeError('Outbound email delivery lane is invalid.');
    }
  }

  private validateProviderMessageId(providerMessageId: string | null): void {
    if (
      providerMessageId !== null &&
      (!providerMessageId.trim() || providerMessageId.length > 500)
    ) {
      throw new TypeError('Provider message ID is invalid.');
    }
  }

  private validateRetryErrorCode(
    errorCode: ScheduleOutboundEmailDeliveryRetryInput['errorCode'],
  ): void {
    if (
      errorCode !== 'PROVIDER_TEMPORARY_REJECTION' &&
      errorCode !== 'PROVIDER_NOT_READY'
    ) {
      throw new TypeError('Outbound email retry error code is invalid.');
    }
  }

  private validateDeadErrorCode(
    errorCode: MarkOutboundEmailDeadInput['errorCode'],
  ): void {
    const allowed: readonly string[] = [
      'PAYLOAD_MISSING',
      'PAYLOAD_DECRYPTION_FAILED',
      'PAYLOAD_INVALID',
      'UNSUPPORTED_TEMPLATE',
      'PROVIDER_PERMANENT_REJECTION',
    ];

    if (!allowed.includes(errorCode)) {
      throw new TypeError('Outbound email terminal error code is invalid.');
    }
  }

  private validateOutcomeUnknownErrorCode(
    errorCode: MarkOutboundEmailOutcomeUnknownInput['errorCode'],
  ): void {
    if (
      errorCode !== 'PROVIDER_OUTCOME_UNKNOWN' &&
      errorCode !== 'PROCESSING_LEASE_EXPIRED'
    ) {
      throw new TypeError('Outbound email outcome error code is invalid.');
    }
  }
}
