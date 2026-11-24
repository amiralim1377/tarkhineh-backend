import type { OutboundEmailEnqueueLane } from '../../contracts/outbound-email-enqueue.contract.js';

export const OUTBOUND_EMAIL_REQUEST_FINGERPRINTER = Symbol(
  'OUTBOUND_EMAIL_REQUEST_FINGERPRINTER',
);

export interface OutboundEmailRequestFingerprintInput {
  readonly lane: OutboundEmailEnqueueLane;
  readonly templateKey: string;
  readonly payloadVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly validUntil: Date | null;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
}

export interface OutboundEmailRequestFingerprinter {
  /**
   * Creates a deterministic HMAC-SHA256 fingerprint
   * for a logical outbound email request.
   *
   * The idempotency key is intentionally excluded:
   * it identifies the request, while this fingerprint
   * identifies its logical content.
   */
  fingerprint(input: OutboundEmailRequestFingerprintInput): string;
}
