/**
 * Signals that the complete Access Control transaction must be retried.
 *
 * This is used only for a known concurrent unique-key race whose winning
 * transaction may have committed the record that the retried operation reads.
 */
export class RetryableAccessControlTransactionError extends Error {
  constructor(readonly originalError: unknown) {
    super(
      'A concurrent Access Control write caused a retryable unique conflict.',
    );
    this.name = 'RetryableAccessControlTransactionError';
  }
}
