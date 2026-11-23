import type { Prisma } from '../../generated/prisma/client.js';
import {
  TRANSACTION_CONTEXT,
  type TransactionContext,
} from '../../shared/application/ports/transaction-runner.port.js';

/**
 * Prisma-specific implementation of the shared TransactionContext.
 *
 * This class wraps the Prisma transaction client and keeps
 * Prisma-specific details inside the Infrastructure layer.
 */
export class PrismaTransactionContext implements TransactionContext {
  readonly [TRANSACTION_CONTEXT] = true as const;

  constructor(private readonly transactionClient: Prisma.TransactionClient) {}

  /**
   * Returns the underlying Prisma transaction client.
   *
   * This method must only be used by Infrastructure adapters.
   */
  getClient(): Prisma.TransactionClient {
    return this.transactionClient;
  }
}
