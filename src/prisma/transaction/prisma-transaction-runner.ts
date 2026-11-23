import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma.service.js';
import { normalizePrismaError } from '../errors/prisma-error-translator.js';

import {
  type TransactionRunner,
  type TransactionContext,
  type TransactionExecutionOptions,
  type TransactionRetryOptions,
} from '../../shared/application/ports/transaction-runner.port.js';

import { PrismaTransactionContext } from './prisma-transaction-context.js';

const MAX_TRANSACTION_ATTEMPTS = 10;
const MAX_RETRY_DELAY_MS = 10_000;

const DEFAULT_INITIAL_DELAY_MS = 20;
const DEFAULT_MAX_DELAY_MS = 200;

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    operation: (context: TransactionContext) => Promise<T>,
    options?: TransactionExecutionOptions,
  ): Promise<T> {
    const retryOptions = this.resolveRetryOptions(options?.retry);

    for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const transactionContext = new PrismaTransactionContext(tx);

          return operation(transactionContext);
        });
      } catch (error: unknown) {
        const shouldRetry =
          isSerializationConflict(error) && attempt < retryOptions.maxAttempts;

        if (!shouldRetry) {
          throw normalizePrismaError(error);
        }

        const retryDelay = this.calculateRetryDelay(attempt, retryOptions);

        await delay(retryDelay);
      }
    }

    throw new Error('Transaction retry loop terminated unexpectedly.');
  }

  private resolveRetryOptions(
    options?: TransactionRetryOptions,
  ): Required<TransactionRetryOptions> {
    if (!options) {
      return {
        maxAttempts: 1,
        initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
        maxDelayMs: DEFAULT_MAX_DELAY_MS,
      };
    }

    const maxAttempts = options.maxAttempts;
    const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

    if (
      !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > MAX_TRANSACTION_ATTEMPTS
    ) {
      throw new RangeError('Transaction max attempts are invalid.');
    }

    if (
      !Number.isSafeInteger(initialDelayMs) ||
      initialDelayMs < 0 ||
      initialDelayMs > MAX_RETRY_DELAY_MS
    ) {
      throw new RangeError('Transaction initial retry delay is invalid.');
    }

    if (
      !Number.isSafeInteger(maxDelayMs) ||
      maxDelayMs < 0 ||
      maxDelayMs > MAX_RETRY_DELAY_MS
    ) {
      throw new RangeError('Transaction maximum retry delay is invalid.');
    }

    return {
      maxAttempts,
      initialDelayMs,
      maxDelayMs,
    };
  }

  private calculateRetryDelay(
    attempt: number,
    options: Required<TransactionRetryOptions>,
  ): number {
    const exponentialDelay = Math.min(
      options.initialDelayMs * 2 ** (attempt - 1),
      options.maxDelayMs,
    );

    // Full jitter prevents concurrent transactions from retrying
    // at exactly the same time.
    return Math.floor(Math.random() * (exponentialDelay + 1));
  }
}
