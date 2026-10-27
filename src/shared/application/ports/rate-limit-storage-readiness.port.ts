/**
 * Application-facing contract for checking whether the rate-limit store
 * is available. Infrastructure implementations must not expose Redis types
 * through this contract.
 */
export const RATE_LIMIT_STORAGE_READINESS = Symbol(
  'RATE_LIMIT_STORAGE_READINESS',
);

export interface RateLimitStorageReadiness {
  /**
   * Resolves when the rate-limit store is available.
   * Rejects with a safe application error when it is unavailable.
   */
  checkReadiness(): Promise<void>;
}
