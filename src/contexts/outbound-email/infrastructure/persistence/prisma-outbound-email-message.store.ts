import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';
import type { TransactionContext } from '../../../../shared/application/ports/transaction-runner.port.js';
import { OutboundEmailIdempotencyConflictError } from '../../application/errors/outbound-email-idempotency-conflict.error.js';
import type {
  CreateOutboundEmailMessageInput,
  CreateOutboundEmailMessageResult,
  OutboundEmailMessageStore,
} from '../../application/ports/outbound-email-message-store.port.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

interface InsertedMessageRow {
  readonly id: string;
}

interface ExistingMessageRow {
  readonly id: string;
  readonly requestFingerprint: string | null;
}

@Injectable()
export class PrismaOutboundEmailMessageStore implements OutboundEmailMessageStore {
  async createOrGet(
    input: CreateOutboundEmailMessageInput,
    transactionContext: TransactionContext,
  ): Promise<CreateOutboundEmailMessageResult> {
    this.validateInput(input);

    const tx = this.getTransactionClient(transactionContext);

    const insertedMessageId = await this.insertMessage(tx, input);

    if (insertedMessageId !== null) {
      return {
        messageId: insertedMessageId,
        created: true,
      };
    }

    const existingMessage = await this.findByIdempotencyKey(
      tx,
      input.idempotencyKey,
    );

    if (!existingMessage) {
      throw new Error('Unable to resolve outbound email idempotency conflict.');
    }

    if (
      !this.matchesFingerprint(
        existingMessage.requestFingerprint,
        input.requestFingerprint,
      )
    ) {
      throw new OutboundEmailIdempotencyConflictError();
    }

    return {
      messageId: existingMessage.id,
      created: false,
    };
  }

  private async insertMessage(
    tx: Prisma.TransactionClient,
    input: CreateOutboundEmailMessageInput,
  ): Promise<string | null> {
    try {
      const messageId = new UniqueId().getValue();

      const rows = await tx.$queryRaw<InsertedMessageRow[]>`
        INSERT INTO public."OutboundEmailMessage" (
          "id",
          "idempotencyKey",
          "requestFingerprint",
          "lane",
          "templateKey",
          "payloadVersion",
          "encryptedPayload",
          "status",
          "availableAt",
          "validUntil",
          "aggregateType",
          "aggregateId",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${messageId},
          ${input.idempotencyKey},
          ${input.requestFingerprint},
          ${input.lane}::"OutboundEmailLane",
          ${input.templateKey},
          ${input.payloadVersion},
          ${input.encryptedPayload},
          'PENDING'::"OutboundEmailStatus",
          timezone('UTC', statement_timestamp()),
          ${input.validUntil},
          ${input.aggregateType},
          ${input.aggregateId},
          timezone('UTC', statement_timestamp()),
          timezone('UTC', statement_timestamp())
        )
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id"
      `;

      return rows[0]?.id ?? null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private async findByIdempotencyKey(
    tx: Prisma.TransactionClient,
    idempotencyKey: string,
  ): Promise<ExistingMessageRow | null> {
    try {
      const rows = await tx.$queryRaw<ExistingMessageRow[]>`
        SELECT
          "id",
          "requestFingerprint"
        FROM public."OutboundEmailMessage"
        WHERE "idempotencyKey" = ${idempotencyKey}
        LIMIT 1
      `;

      return rows[0] ?? null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private matchesFingerprint(
    existingFingerprint: string | null,
    requestedFingerprint: string,
  ): boolean {
    if (
      existingFingerprint === null ||
      !FINGERPRINT_PATTERN.test(existingFingerprint) ||
      !FINGERPRINT_PATTERN.test(requestedFingerprint)
    ) {
      return false;
    }

    const existingBuffer = Buffer.from(existingFingerprint, 'hex');
    const requestedBuffer = Buffer.from(requestedFingerprint, 'hex');

    return (
      existingBuffer.length === requestedBuffer.length &&
      timingSafeEqual(existingBuffer, requestedBuffer)
    );
  }

  private getTransactionClient(
    context: TransactionContext,
  ): Prisma.TransactionClient {
    if (!(context instanceof PrismaTransactionContext)) {
      throw new TypeError(
        'PrismaOutboundEmailMessageStore requires a PrismaTransactionContext.',
      );
    }

    return context.getClient();
  }

  private validateInput(input: CreateOutboundEmailMessageInput): void {
    if (!input || typeof input !== 'object') {
      throw new TypeError('Outbound email message input is invalid.');
    }

    if (
      typeof input.idempotencyKey !== 'string' ||
      !input.idempotencyKey.trim() ||
      input.idempotencyKey !== input.idempotencyKey.trim()
    ) {
      throw new TypeError('Outbound email idempotency key is invalid.');
    }

    if (
      typeof input.requestFingerprint !== 'string' ||
      !FINGERPRINT_PATTERN.test(input.requestFingerprint)
    ) {
      throw new TypeError('Outbound email request fingerprint is invalid.');
    }

    if (input.lane !== 'TRANSACTIONAL' && input.lane !== 'BULK') {
      throw new TypeError('Outbound email lane is invalid.');
    }

    if (typeof input.templateKey !== 'string' || !input.templateKey.trim()) {
      throw new TypeError('Outbound email template key is invalid.');
    }

    if (
      !Number.isSafeInteger(input.payloadVersion) ||
      input.payloadVersion < 1
    ) {
      throw new RangeError('Outbound email payload version is invalid.');
    }

    if (
      typeof input.encryptedPayload !== 'string' ||
      input.encryptedPayload.length === 0
    ) {
      throw new TypeError('Outbound email encrypted payload is invalid.');
    }

    if (
      input.validUntil !== null &&
      (!(input.validUntil instanceof Date) ||
        !Number.isFinite(input.validUntil.getTime()))
    ) {
      throw new TypeError('Outbound email expiration date is invalid.');
    }

    this.validateAggregateReference(input);
  }

  private validateAggregateReference(
    input: CreateOutboundEmailMessageInput,
  ): void {
    const { aggregateType, aggregateId } = input;

    if (
      aggregateType !== null &&
      (typeof aggregateType !== 'string' || !aggregateType.trim())
    ) {
      throw new TypeError('Outbound email aggregate type is invalid.');
    }

    if (
      aggregateId !== null &&
      (typeof aggregateId !== 'string' || !aggregateId.trim())
    ) {
      throw new TypeError('Outbound email aggregate ID is invalid.');
    }

    if ((aggregateType === null) !== (aggregateId === null)) {
      throw new TypeError(
        'Outbound email aggregate type and ID must be provided together.',
      );
    }
  }
}
