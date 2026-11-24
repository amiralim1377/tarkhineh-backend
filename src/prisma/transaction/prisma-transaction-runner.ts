import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma.service.js';
import { normalizePrismaError } from '../errors/prisma-error-translator.js';

import {
  type TransactionRunner,
  type TransactionContext,
  type TransactionExecutionOptions,
  type TransactionRetryOptions,
  type TransactionIsolationLevel,
} from '../../shared/application/ports/transaction-runner.port.js';

import { PrismaTransactionContext } from './prisma-transaction-context.js';

const MAX_TRANSACTION_ATTEMPTS = 10;
const MAX_TRANSACTION_OPTION_MS = 300_000;
const MAX_RETRY_DELAY_MS = 10_000;

const DEFAULT_INITIAL_DELAY_MS = 20;
const DEFAULT_MAX_DELAY_MS = 200;

interface ResolvedRetryOptions {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly shouldRetry?: (error: unknown) => boolean;
}

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

function mapIsolationLevel(level: TransactionIsolationLevel) {
  switch (level) {
    case 'READ_UNCOMMITTED':
      return Prisma.TransactionIsolationLevel.ReadUncommitted;

    case 'READ_COMMITTED':
      return Prisma.TransactionIsolationLevel.ReadCommitted;

    case 'REPEATABLE_READ':
      return Prisma.TransactionIsolationLevel.RepeatableRead;

    case 'SERIALIZABLE':
      return Prisma.TransactionIsolationLevel.Serializable;

    default:
      throw new TypeError('Transaction isolation level is invalid.');
  }
}

@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    operation: (context: TransactionContext) => Promise<T>,
    options?: TransactionExecutionOptions,
  ): Promise<T> {
    const retryOptions = this.resolveRetryOptions(options?.retry);
    const transactionOptions = this.resolveTransactionOptions(options);

    for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const transactionContext = new PrismaTransactionContext(tx);

          return operation(transactionContext);
        }, transactionOptions);
      } catch (error: unknown) {
        const shouldRetry =
          attempt < retryOptions.maxAttempts &&
          this.isRetryable(error, retryOptions);

        if (!shouldRetry) {
          throw normalizePrismaError(error);
        }

        const retryDelay = this.calculateRetryDelay(attempt, retryOptions);

        await delay(retryDelay);
      }
    }

    throw new Error('Transaction retry loop terminated unexpectedly.');
  }

  private resolveTransactionOptions(options?: TransactionExecutionOptions) {
    const transactionOptions: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: ReturnType<typeof mapIsolationLevel>;
    } = {};

    if (options?.maxWaitMs !== undefined) {
      this.validateTransactionDuration(
        options.maxWaitMs,
        'Transaction maximum wait time is invalid.',
      );

      transactionOptions.maxWait = options.maxWaitMs;
    }

    if (options?.timeoutMs !== undefined) {
      this.validateTransactionDuration(
        options.timeoutMs,
        'Transaction timeout is invalid.',
      );

      transactionOptions.timeout = options.timeoutMs;
    }

    if (options?.isolationLevel !== undefined) {
      transactionOptions.isolationLevel = mapIsolationLevel(
        options.isolationLevel,
      );
    }

    return transactionOptions;
  }

  private validateTransactionDuration(
    value: number,
    errorMessage: string,
  ): void {
    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > MAX_TRANSACTION_OPTION_MS
    ) {
      throw new RangeError(errorMessage);
    }
  }

  private resolveRetryOptions(
    options?: TransactionRetryOptions,
  ): ResolvedRetryOptions {
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
      maxDelayMs < initialDelayMs ||
      maxDelayMs > MAX_RETRY_DELAY_MS
    ) {
      throw new RangeError('Transaction maximum retry delay is invalid.');
    }

    if (
      options.shouldRetry !== undefined &&
      typeof options.shouldRetry !== 'function'
    ) {
      throw new TypeError('Transaction retry condition is invalid.');
    }

    return {
      maxAttempts,
      initialDelayMs,
      maxDelayMs,
      shouldRetry: options.shouldRetry,
    };
  }

  private isRetryable(error: unknown, options: ResolvedRetryOptions): boolean {
    // Built-in retryable Prisma error.
    if (isSerializationConflict(error)) {
      return true;
    }

    // Context-specific retryable errors.
    return options.shouldRetry?.(error) === true;
  }

  private calculateRetryDelay(
    attempt: number,
    options: ResolvedRetryOptions,
  ): number {
    const exponentialDelay = Math.min(
      options.initialDelayMs * 2 ** (attempt - 1),
      options.maxDelayMs,
    );

    // Full jitter prevents concurrent transactions from
    // retrying at exactly the same time.
    return Math.floor(Math.random() * (exponentialDelay + 1));
  }
}
