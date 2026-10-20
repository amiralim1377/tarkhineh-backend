export const OUTBOUND_EMAIL_DISPATCH_STORE = Symbol(
  'OUTBOUND_EMAIL_DISPATCH_STORE',
);

export type OutboundEmailDispatchLane = 'TRANSACTIONAL' | 'BULK';

export interface ClaimOutboundEmailMessagesInput {
  readonly lane: OutboundEmailDispatchLane;
  readonly batchSize: number;
  readonly leaseDurationMs: number;
  readonly ownerPrefix: string;
}

export interface OutboundEmailDispatchLease {
  readonly messageId: string;
  readonly lane: OutboundEmailDispatchLane;
  readonly leaseToken: string;
  readonly leaseUntil: Date;
}

export interface MarkOutboundEmailQueuedInput {
  readonly messageId: string;
  readonly leaseToken: string;
}

export interface ScheduleOutboundEmailDispatchRetryInput {
  readonly messageId: string;
  readonly leaseToken: string;
  readonly retryDelayMs: number;
  readonly errorCode: 'QUEUE_ENQUEUE_FAILED';
}

export interface FindStaleQueuedMessagesInput {
  readonly lane: OutboundEmailDispatchLane;
  readonly batchSize: number;
  readonly queuedBefore: Date;
  readonly now: Date;
}

export interface StaleQueuedOutboundEmailMessage {
  readonly messageId: string;
  readonly lane: OutboundEmailDispatchLane;
}

export interface RecoverMissingQueuedJobInput {
  readonly messageId: string;
  readonly lane: OutboundEmailDispatchLane;
  readonly queuedBefore: Date;
  readonly now: Date;
  readonly retryAt: Date;
}

export interface OutboundEmailDispatchStore {
  claimBatch(
    input: ClaimOutboundEmailMessagesInput,
  ): Promise<readonly OutboundEmailDispatchLease[]>;

  markQueued(input: MarkOutboundEmailQueuedInput): Promise<boolean>;

  scheduleRetry(
    input: ScheduleOutboundEmailDispatchRetryInput,
  ): Promise<boolean>;

  findStaleQueuedMessages(
    input: FindStaleQueuedMessagesInput,
  ): Promise<readonly StaleQueuedOutboundEmailMessage[]>;

  recoverMissingQueuedJob(
    input: RecoverMissingQueuedJobInput,
  ): Promise<boolean>;
}
