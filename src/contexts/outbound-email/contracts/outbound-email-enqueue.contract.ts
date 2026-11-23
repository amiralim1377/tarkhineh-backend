export const OUTBOUND_EMAIL_ENQUEUE = Symbol('OUTBOUND_EMAIL_ENQUEUE');

export type OutboundEmailEnqueueLane = 'TRANSACTIONAL' | 'BULK';

export interface EnqueueOutboundEmailInput {
  /**
   * Unique key used to prevent duplicate logical messages.
   */
  readonly idempotencyKey: string;

  readonly lane: OutboundEmailEnqueueLane;

  /**
   * Registered email template identifier.
   */
  readonly templateKey: string;

  readonly payloadVersion: number;

  /**
   * Plain payload.
   * The Outbound Email module is responsible for encryption.
   */
  readonly payload: Readonly<Record<string, unknown>>;

  /**
   * Optional message expiration date.
   */
  readonly validUntil?: Date | null;

  /**
   * Reference to the originating domain object.
   */
  readonly aggregateType?: string | null;
  readonly aggregateId?: string | null;
}

export interface EnqueueOutboundEmailResult {
  readonly messageId: string;
}

export interface OutboundEmailEnqueuePort {
  /**
   * Registers a new outbound email message.
   *
   * Repeated requests with the same idempotency key
   * must not create duplicate logical messages.
   */
  enqueue(
    input: EnqueueOutboundEmailInput,
  ): Promise<EnqueueOutboundEmailResult>;
}
