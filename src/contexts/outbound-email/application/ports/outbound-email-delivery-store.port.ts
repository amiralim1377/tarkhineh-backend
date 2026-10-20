export const OUTBOUND_EMAIL_DELIVERY_STORE = Symbol(
  'OUTBOUND_EMAIL_DELIVERY_STORE',
);

export type OutboundEmailDeliveryLane = 'TRANSACTIONAL' | 'BULK';

export type OutboundEmailRetryErrorCode =
  | 'PROVIDER_TEMPORARY_REJECTION'
  | 'PROVIDER_NOT_READY';

export type OutboundEmailDeadErrorCode =
  | 'PAYLOAD_MISSING'
  | 'PAYLOAD_DECRYPTION_FAILED'
  | 'PAYLOAD_INVALID'
  | 'UNSUPPORTED_TEMPLATE'
  | 'PROVIDER_PERMANENT_REJECTION';

export type OutboundEmailOutcomeUnknownErrorCode =
  | 'PROVIDER_OUTCOME_UNKNOWN'
  | 'PROCESSING_LEASE_EXPIRED';

export interface ClaimOutboundEmailForDeliveryInput {
  readonly messageId: string;
  readonly lane: OutboundEmailDeliveryLane;
  readonly workerPrefix: string;
  readonly leaseDurationMs: number;
}

export interface ClaimedOutboundEmailDelivery {
  readonly messageId: string;
  readonly lane: OutboundEmailDeliveryLane;
  readonly leaseToken: string;
  readonly leaseUntil: Date;
  readonly templateKey: string;
  readonly payloadVersion: number;
  readonly encryptedPayload: string | null;
  readonly validUntil: Date | null;
}

export interface MarkOutboundEmailAcceptedInput {
  readonly messageId: string;
  readonly leaseToken: string;
  readonly providerMessageId: string | null;
}

export interface ScheduleOutboundEmailDeliveryRetryInput {
  readonly messageId: string;
  readonly leaseToken: string;
  readonly retryDelayMs: number;
  readonly errorCode: OutboundEmailRetryErrorCode;
}

export interface MarkOutboundEmailDeadInput {
  readonly messageId: string;
  readonly leaseToken: string;
  readonly errorCode: OutboundEmailDeadErrorCode;
}

export interface MarkOutboundEmailOutcomeUnknownInput {
  readonly messageId: string;
  readonly leaseToken: string;
  readonly errorCode: OutboundEmailOutcomeUnknownErrorCode;
}

export interface OutboundEmailDeliveryStore {
  /**
   * Atomically acquires a delivery lease.
   *
   * Must support QUEUED messages and DISPATCHING messages whose
   * dispatcher lease is still valid, because a BullMQ Worker can
   * start before the Dispatcher persists QUEUED.
   *
   * Expired messages must not be delivered.
   * Returns null when the message cannot be claimed.
   */
  claimForDelivery(
    input: ClaimOutboundEmailForDeliveryInput,
  ): Promise<ClaimedOutboundEmailDelivery | null>;

  /**
   * Records confirmed Provider acceptance.
   * The current PROCESSING state and lease token must still match.
   */
  markAccepted(
    input: MarkOutboundEmailAcceptedInput,
  ): Promise<boolean>;

  /**
   * Schedules a retry only when non-acceptance is known to be safe.
   */
  scheduleRetry(
    input: ScheduleOutboundEmailDeliveryRetryInput,
  ): Promise<boolean>;

  /**
   * Marks a permanently undeliverable message as DEAD.
   */
  markDead(input: MarkOutboundEmailDeadInput): Promise<boolean>;

  /**
   * Records an ambiguous Provider outcome without automatic retry.
   */
  markOutcomeUnknown(
    input: MarkOutboundEmailOutcomeUnknownInput,
  ): Promise<boolean>;

  /**
   * Moves expired PROCESSING leases to OUTCOME_UNKNOWN.
   * An expired worker lease does not prove that sending failed.
   */
  recoverExpiredProcessingMessages(
    batchSize: number,
  ): Promise<number>;
}
