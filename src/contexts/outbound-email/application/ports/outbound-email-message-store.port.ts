import type { TransactionContext } from '../../../../shared/application/ports/transaction-runner.port.js';
import type { OutboundEmailEnqueueLane } from '../../contracts/outbound-email-enqueue.contract.js';

export const OUTBOUND_EMAIL_MESSAGE_STORE = Symbol(
  'OUTBOUND_EMAIL_MESSAGE_STORE',
);

export interface CreateOutboundEmailMessageInput {
  /**
   * Unique key used to prevent duplicate logical messages.
   */
  readonly idempotencyKey: string;

  /**
   * HMAC-SHA256 fingerprint of the logical request.
   */
  readonly requestFingerprint: string;

  readonly lane: OutboundEmailEnqueueLane;

  readonly templateKey: string;

  readonly payloadVersion: number;

  readonly encryptedPayload: string;

  readonly validUntil: Date | null;

  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
}
export interface CreateOutboundEmailMessageResult {
  readonly messageId: string;
  readonly created: boolean;
}

export interface OutboundEmailMessageStore {
  /**
   * Creates a new outbound email message.
   *
   * If a message with the same idempotency key already exists,
   * returns its existing ID without creating a duplicate.
   *
   * The same idempotency key must always represent
   * the same logical email message.
   *
   * The implementation must:
   * - Use the supplied transaction context.
   * - Never create an independent transaction.
   * - Never commit or roll back the supplied transaction.
   * - Never overwrite an existing message.
   */
  createOrGet(
    input: CreateOutboundEmailMessageInput,
    transactionContext: TransactionContext,
  ): Promise<CreateOutboundEmailMessageResult>;
}
