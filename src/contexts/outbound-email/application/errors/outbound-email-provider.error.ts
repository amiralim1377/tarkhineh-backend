export type OutboundEmailProviderFailureKind =
  | 'TEMPORARY_REJECTION'
  | 'PERMANENT_REJECTION'
  | 'OUTCOME_UNKNOWN'
  | 'NOT_READY';

export class OutboundEmailProviderError extends Error {
  constructor(readonly kind: OutboundEmailProviderFailureKind) {
    super(`Outbound email provider failure: ${kind}`);
    this.name = 'OutboundEmailProviderError';
  }
}
