export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');

/**
 * Identifies a transaction context created by the TransactionRunner.
 *
 * The context is opaque to Application layers.
 * Infrastructure implementations may use it to access
 * the underlying database transaction.
 */
export const TRANSACTION_CONTEXT = Symbol('TRANSACTION_CONTEXT');

export interface TransactionContext {
  readonly [TRANSACTION_CONTEXT]: true;
}

/**
 * Executes an operation within a database transaction.
 *
 * The implementation is responsible for:
 * - Starting the transaction.
 * - Providing a transaction-bound context.
 * - Committing when the operation succeeds.
 * - Rolling back when the operation fails.
 * - Propagating the original error.
 *
 * The context must be used only during the operation callback.
 * It must not be retained or used after the callback completes.
 *
 * Operations must not perform external side effects because
 * the transaction may be rolled back or retried.
 */
export interface TransactionRunner {
  execute<T>(
    operation: (context: TransactionContext) => Promise<T>,
  ): Promise<T>;
}
