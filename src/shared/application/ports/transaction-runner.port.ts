export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');

export const TRANSACTION_CONTEXT = Symbol('TRANSACTION_CONTEXT');

/**
 * Opaque reference to an active database transaction.
 *
 * The actual transaction implementation belongs to Infrastructure.
 */
export interface TransactionContext {
  readonly [TRANSACTION_CONTEXT]: true;
}

/**
 * Database transaction isolation level.
 */
export type TransactionIsolationLevel =
  'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

/**
 * Controls automatic transaction retries.
 */
export interface TransactionRetryOptions {
  /**
   * Total transaction attempts, including the first attempt.
   */
  readonly maxAttempts: number;

  /**
   * Initial delay before the first retry.
   */
  readonly initialDelayMs?: number;

  /**
   * Maximum delay between retries.
   */
  readonly maxDelayMs?: number;

  /**
   * Optional context-specific retry condition.
   *
   * The TransactionRunner also handles its built-in
   * retryable database errors independently.
   */
  /**
   * Synchronously determines whether a failed transaction
   * should be retried.
   *
   * Must be deterministic, side-effect-free and must not throw.
   */
  readonly shouldRetry?: (error: unknown) => boolean;
}

/**
 * Configures the execution of a database transaction.
 */
export interface TransactionExecutionOptions {
  /**
   * Isolation level for the transaction.
   *
   * When omitted, the database/Prisma default is used.
   */
  readonly isolationLevel?: TransactionIsolationLevel;

  /**
   * Maximum time, in milliseconds, to wait for a transaction
   * slot before starting the transaction.
   */
  readonly maxWaitMs?: number;

  /**
   * Maximum transaction execution duration, in milliseconds.
   */
  readonly timeoutMs?: number;

  /**
   * Optional retry policy.
   *
   * When omitted, the operation is executed only once.
   */
  readonly retry?: TransactionRetryOptions;
}

/**
 * Executes an operation within a database transaction.
 *
 * The implementation is responsible for:
 * - Starting the transaction.
 * - Providing a transaction-bound context.
 * - Committing when the operation succeeds.
 * - Rolling back when the operation fails.
 * - Applying transaction isolation and timeout settings.
 * - Retrying only explicitly recognized retryable errors.
 * - Propagating non-retryable application errors.
 *
 * The context must not be retained or used after
 * the operation callback completes.
 *
 * The callback may execute multiple times when retry is enabled.
 * Therefore, callbacks must be safe to execute again.
 *
 * External side effects must never be performed inside
 * the transaction callback.
 */
export interface TransactionRunner {
  execute<T>(
    operation: (context: TransactionContext) => Promise<T>,
    options?: TransactionExecutionOptions,
  ): Promise<T>;
}
