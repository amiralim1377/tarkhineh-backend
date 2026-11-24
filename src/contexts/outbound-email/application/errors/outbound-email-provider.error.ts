export type OutboundEmailProviderFailureKind =
  | 'TEMPORARY_REJECTION'
  | 'PERMANENT_REJECTION'
  | 'OUTCOME_UNKNOWN'
  | 'NOT_READY';

export interface OutboundEmailProviderDiagnostics {
  readonly providerCode?: string;
  readonly responseCode?: number;
  readonly command?: string;
  readonly timeoutType?: string;
}

export class OutboundEmailProviderError extends Error {
  constructor(
    readonly kind: OutboundEmailProviderFailureKind,
    readonly diagnostics: OutboundEmailProviderDiagnostics = {},
  ) {
    super(`Outbound email provider failure: ${kind}`);
    this.name = 'OutboundEmailProviderError';
  }
}
