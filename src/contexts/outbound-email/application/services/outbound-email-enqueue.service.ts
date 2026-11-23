import { Inject, Injectable } from '@nestjs/common';
import {
  type OutboundEmailEnqueuePort,
  type EnqueueOutboundEmailInput,
  type EnqueueOutboundEmailResult,
} from '../../contracts/outbound-email-enqueue.contract.js';
import {
  OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
  type OutboundEmailPayloadEncryptor,
} from '../ports/outbound-email-payload-encryptor.port.js';
import {
  OUTBOUND_EMAIL_MESSAGE_STORE,
  type OutboundEmailMessageStore,
  type CreateOutboundEmailMessageInput,
} from '../ports/outbound-email-message-store.port.js';
import {
  TRANSACTION_CONTEXT,
  type TransactionContext,
} from '../../../../shared/application/ports/transaction-runner.port.js';

const TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MAX_TEMPLATE_KEY_LENGTH = 120;
const MAX_TEMPLATE_VERSION = 2_147_483_647;

@Injectable()
export class OutboundEmailEnqueueService implements OutboundEmailEnqueuePort {
  constructor(
    @Inject(OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR)
    private readonly payloadEncryptor: OutboundEmailPayloadEncryptor,

    @Inject(OUTBOUND_EMAIL_MESSAGE_STORE)
    private readonly messageStore: OutboundEmailMessageStore,
  ) {}

  async enqueue(
    input: EnqueueOutboundEmailInput,
    transactionContext: TransactionContext,
  ): Promise<EnqueueOutboundEmailResult> {
    this.validateTransactionContext(transactionContext);
    this.validateInput(input);

    const serializedPayload = this.serializePayload(input.payload);

    const encryptedPayload = this.payloadEncryptor.encrypt(serializedPayload);

    if (typeof encryptedPayload !== 'string' || encryptedPayload.length === 0) {
      throw new Error('Outbound email payload encryption failed.');
    }

    const messageInput: CreateOutboundEmailMessageInput = {
      idempotencyKey: input.idempotencyKey.trim(),
      lane: input.lane,
      templateKey: input.templateKey,
      payloadVersion: input.payloadVersion,
      encryptedPayload,
      validUntil: input.validUntil ?? null,
      aggregateType: input.aggregateType?.trim() || null,
      aggregateId: input.aggregateId?.trim() || null,
    };

    return this.messageStore.createOrGet(messageInput, transactionContext);
  }

  private validateTransactionContext(context: TransactionContext): void {
    if (!context || context[TRANSACTION_CONTEXT] !== true) {
      throw new TypeError('Transaction context is invalid.');
    }
  }

  private validateInput(input: EnqueueOutboundEmailInput): void {
    if (!input || typeof input !== 'object') {
      throw new TypeError('Outbound email input is invalid.');
    }

    if (
      typeof input.idempotencyKey !== 'string' ||
      !input.idempotencyKey.trim()
    ) {
      throw new TypeError('Outbound email idempotency key is invalid.');
    }

    if (input.lane !== 'TRANSACTIONAL' && input.lane !== 'BULK') {
      throw new TypeError('Outbound email lane is invalid.');
    }

    if (
      typeof input.templateKey !== 'string' ||
      input.templateKey.length > MAX_TEMPLATE_KEY_LENGTH ||
      !TEMPLATE_KEY_PATTERN.test(input.templateKey)
    ) {
      throw new TypeError('Outbound email template key is invalid.');
    }

    if (
      !Number.isSafeInteger(input.payloadVersion) ||
      input.payloadVersion < 1 ||
      input.payloadVersion > MAX_TEMPLATE_VERSION
    ) {
      throw new RangeError('Outbound email payload version is invalid.');
    }

    if (
      typeof input.payload !== 'object' ||
      input.payload === null ||
      Array.isArray(input.payload)
    ) {
      throw new TypeError('Outbound email payload is invalid.');
    }

    this.validateExpiration(input.validUntil);
    this.validateAggregateReference(input);
  }

  private validateExpiration(validUntil?: Date | null): void {
    if (validUntil === undefined || validUntil === null) {
      return;
    }

    if (
      !(validUntil instanceof Date) ||
      !Number.isFinite(validUntil.getTime())
    ) {
      throw new RangeError('Outbound email expiration date is invalid.');
    }

    if (validUntil.getTime() <= Date.now()) {
      throw new RangeError(
        'Outbound email expiration date must be in the future.',
      );
    }
  }

  private validateAggregateReference(input: EnqueueOutboundEmailInput): void {
    const aggregateType = input.aggregateType;
    const aggregateId = input.aggregateId;

    if (
      aggregateType !== undefined &&
      aggregateType !== null &&
      (typeof aggregateType !== 'string' || !aggregateType.trim())
    ) {
      throw new TypeError('Outbound email aggregate type is invalid.');
    }

    if (
      aggregateId !== undefined &&
      aggregateId !== null &&
      (typeof aggregateId !== 'string' || !aggregateId.trim())
    ) {
      throw new TypeError('Outbound email aggregate ID is invalid.');
    }

    const hasAggregateType = Boolean(aggregateType?.trim());
    const hasAggregateId = Boolean(aggregateId?.trim());

    if (hasAggregateType !== hasAggregateId) {
      throw new TypeError(
        'Outbound email aggregate type and ID must be provided together.',
      );
    }
  }

  private serializePayload(payload: Readonly<Record<string, unknown>>): string {
    try {
      const serialized = JSON.stringify(payload);

      if (typeof serialized !== 'string') {
        throw new TypeError();
      }

      return serialized;
    } catch {
      throw new TypeError('Outbound email payload must be JSON serializable.');
    }
  }
}
