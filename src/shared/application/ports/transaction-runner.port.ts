export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');

export const TRANSACTION_CONTEXT = Symbol('TRANSACTION_CONTEXT');

export interface TransactionContext {
  readonly [TRANSACTION_CONTEXT]: true;
}

export interface TransactionRetryOptions {
  /**
   * Total transaction attempts, including the first attempt.
   */
  readonly maxAttempts: number;

  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

export interface TransactionExecutionOptions {
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
 * - Propagating application errors.
 *
 * The context must not be retained or used after
 * the operation callback completes.
 *
 * Operations must not perform external side effects.
 */
export interface TransactionRunner {
  execute<T>(
    operation: (context: TransactionContext) => Promise<T>,
    options?: TransactionExecutionOptions,
  ): Promise<T>;
}
