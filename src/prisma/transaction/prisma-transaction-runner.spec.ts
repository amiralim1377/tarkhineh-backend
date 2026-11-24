import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma.service.js';

import { PrismaTransactionRunner } from './prisma-transaction-runner.js';
import { PrismaTransactionContext } from './prisma-transaction-context.js';

import type {
  TransactionContext,
  TransactionExecutionOptions,
  TransactionRetryOptions,
  TransactionIsolationLevel,
} from '../../shared/application/ports/transaction-runner.port.js';

type TransactionCallback = (
  transaction: Prisma.TransactionClient,
) => Promise<unknown>;

interface PrismaTransactionOptions {
  readonly maxWait?: number;
  readonly timeout?: number;
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
}

type TransactionExecutor = (
  callback: TransactionCallback,
  options?: PrismaTransactionOptions,
) => Promise<unknown>;

const transactionMock = vi.fn<TransactionExecutor>();

const transactionClient = {} as Prisma.TransactionClient;

class RetryableContextError extends Error {
  constructor() {
    super('Retryable context error.');
    this.name = 'RetryableContextError';
  }
}

function createPrismaError(code: 'P2034' | 'P2002') {
  return new Prisma.PrismaClientKnownRequestError(
    'Prisma transaction failed.',
    {
      code,
      clientVersion: '7.10.1',
    },
  );
}

function createRetryOptions(
  overrides: Partial<TransactionRetryOptions> = {},
): TransactionExecutionOptions {
  return {
    retry: {
      maxAttempts: 3,
      initialDelayMs: 0,
      maxDelayMs: 0,
      ...overrides,
    },
  };
}

describe('PrismaTransactionRunner', () => {
  let sut: PrismaTransactionRunner;

  beforeEach(() => {
    transactionMock.mockReset();

    sut = new PrismaTransactionRunner({
      $transaction: transactionMock,
    } as unknown as PrismaService);
  });

  // --------------------------------------------------
  // EXECUTE
  // --------------------------------------------------

  describe('execute', () => {
    it('should execute the operation inside a Prisma transaction', async () => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );

      const operation = vi.fn(
        async (_context: TransactionContext): Promise<string> => 'result',
      );

      await sut.execute(operation);

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should provide a PrismaTransactionContext', async () => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );

      let receivedContext: TransactionContext | undefined;

      await sut.execute(async (context) => {
        receivedContext = context;
      });

      expect(receivedContext).toBeInstanceOf(PrismaTransactionContext);
    });

    it('should provide the underlying Prisma transaction client', async () => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );

      let receivedContext: PrismaTransactionContext | undefined;

      await sut.execute(async (context) => {
        receivedContext = context as PrismaTransactionContext;
      });

      expect(receivedContext?.getClient()).toBe(transactionClient);
    });

    it('should return the operation result', async () => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );

      const expectedResult = {
        membershipInvitationId: 'invitation-123',
      };

      const result = await sut.execute(async () => expectedResult);

      expect(result).toEqual(expectedResult);
    });

    it('should propagate the original operation error', async () => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );

      const operationError = new Error('Operation failed.');

      const operation = vi.fn(async () => {
        throw operationError;
      });

      await expect(sut.execute(operation)).rejects.toBe(operationError);

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should not retry when retry options are not provided', async () => {
      const serializationError = createPrismaError('P2034');

      transactionMock.mockRejectedValue(serializationError);

      await expect(sut.execute(async () => 'result')).rejects.toBe(
        serializationError,
      );

      expect(transactionMock).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------
  // RETRY BEHAVIOR
  // --------------------------------------------------

  describe('retry behavior', () => {
    it('should retry when a serialization conflict occurs', async () => {
      const serializationError = createPrismaError('P2034');

      let attempt = 0;

      transactionMock.mockImplementation(async (callback) => {
        attempt += 1;

        const result = await callback(transactionClient);

        if (attempt < 3) {
          throw serializationError;
        }

        return result;
      });

      const operation = vi.fn(async (): Promise<string> => 'success');

      const result = await sut.execute(operation, createRetryOptions());

      expect(result).toBe('success');
      expect(transactionMock).toHaveBeenCalledTimes(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should create a new transaction context for every attempt', async () => {
      const serializationError = createPrismaError('P2034');

      const transactionClients = [
        {} as Prisma.TransactionClient,
        {} as Prisma.TransactionClient,
        {} as Prisma.TransactionClient,
      ];

      let attempt = 0;

      transactionMock.mockImplementation(async (callback) => {
        const currentAttempt = attempt++;

        const result = await callback(transactionClients[currentAttempt]!);

        if (currentAttempt < 2) {
          throw serializationError;
        }

        return result;
      });

      const receivedContexts: PrismaTransactionContext[] = [];

      await sut.execute(async (context) => {
        receivedContexts.push(context as PrismaTransactionContext);

        return 'success';
      }, createRetryOptions());

      expect(receivedContexts).toHaveLength(3);
      expect(new Set(receivedContexts).size).toBe(3);

      expect(receivedContexts.map((context) => context.getClient())).toEqual(
        transactionClients,
      );
    });

    it('should not retry when a non-retryable Prisma error occurs', async () => {
      const uniqueConstraintError = createPrismaError('P2002');

      transactionMock.mockRejectedValue(uniqueConstraintError);

      await expect(
        sut.execute(async () => 'result', createRetryOptions()),
      ).rejects.toBe(uniqueConstraintError);

      expect(transactionMock).toHaveBeenCalledOnce();
    });

    it('should stop retrying after maxAttempts is reached', async () => {
      const serializationError = createPrismaError('P2034');

      transactionMock.mockImplementation(async (callback) => {
        await callback(transactionClient);
        throw serializationError;
      });

      const operation = vi.fn(async (): Promise<string> => 'result');

      await expect(
        sut.execute(
          operation,
          createRetryOptions({
            maxAttempts: 3,
          }),
        ),
      ).rejects.toBe(serializationError);

      expect(transactionMock).toHaveBeenCalledTimes(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should execute only once when maxAttempts is one', async () => {
      const serializationError = createPrismaError('P2034');

      transactionMock.mockRejectedValue(serializationError);

      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            maxAttempts: 1,
          }),
        ),
      ).rejects.toBe(serializationError);

      expect(transactionMock).toHaveBeenCalledOnce();
    });

    it('should not retry when the operation throws a non-Prisma error', async () => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );

      const operationError = new Error('Domain operation failed.');

      const operation = vi.fn(async () => {
        throw operationError;
      });

      await expect(
        sut.execute(
          operation,
          createRetryOptions({
            maxAttempts: 3,
          }),
        ),
      ).rejects.toBe(operationError);

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(operation).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------
  // TRANSACTION OPTIONS
  // --------------------------------------------------

  describe('transaction options', () => {
    beforeEach(() => {
      transactionMock.mockImplementation(async (callback) =>
        callback(transactionClient),
      );
    });

    it('should use Prisma defaults when transaction options are not provided', async () => {
      await sut.execute(async () => 'result');

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(transactionMock.mock.calls[0]?.[1]).toEqual({});
    });

    it.each([
      {
        input: 'READ_UNCOMMITTED',
        expected: Prisma.TransactionIsolationLevel.ReadUncommitted,
      },
      {
        input: 'READ_COMMITTED',
        expected: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
      {
        input: 'REPEATABLE_READ',
        expected: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
      {
        input: 'SERIALIZABLE',
        expected: Prisma.TransactionIsolationLevel.Serializable,
      },
    ] as const)(
      'should map $input to Prisma isolation level',
      async ({ input, expected }) => {
        await sut.execute(async () => 'result', {
          isolationLevel: input,
        });

        expect(transactionMock.mock.calls[0]?.[1]).toEqual({
          isolationLevel: expected,
        });
      },
    );

    it('should pass maxWaitMs and timeoutMs to Prisma', async () => {
      await sut.execute(async () => 'result', {
        maxWaitMs: 10_000,
        timeoutMs: 30_000,
      });

      expect(transactionMock.mock.calls[0]?.[1]).toEqual({
        maxWait: 10_000,
        timeout: 30_000,
      });
    });

    it('should pass all transaction options together', async () => {
      await sut.execute(async () => 'result', {
        isolationLevel: 'SERIALIZABLE',
        maxWaitMs: 10_000,
        timeoutMs: 30_000,
      });

      expect(transactionMock.mock.calls[0]?.[1]).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    });

    it('should reject an invalid isolation level', async () => {
      await expect(
        sut.execute(async () => 'result', {
          isolationLevel: 'INVALID' as TransactionIsolationLevel,
        }),
      ).rejects.toThrow(TypeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------
  // TRANSACTION DURATION VALIDATION
  // --------------------------------------------------

  describe('transaction duration validation', () => {
    it.each([0, -1, 1.5, 300_001])(
      'should reject invalid maxWaitMs: %s',
      async (maxWaitMs) => {
        await expect(
          sut.execute(async () => 'result', { maxWaitMs }),
        ).rejects.toThrow(RangeError);

        expect(transactionMock).not.toHaveBeenCalled();
      },
    );

    it.each([0, -1, 1.5, 300_001])(
      'should reject invalid timeoutMs: %s',
      async (timeoutMs) => {
        await expect(
          sut.execute(async () => 'result', { timeoutMs }),
        ).rejects.toThrow(RangeError);

        expect(transactionMock).not.toHaveBeenCalled();
      },
    );
  });

  // --------------------------------------------------
  // RETRY OPTIONS VALIDATION
  // --------------------------------------------------

  describe('retry options validation', () => {
    it('should reject maxAttempts smaller than one', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            maxAttempts: 0,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject maxAttempts greater than the allowed maximum', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            maxAttempts: 11,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject a negative initialDelayMs', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            initialDelayMs: -1,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject initialDelayMs greater than the allowed maximum', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            initialDelayMs: 10_001,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject a negative maxDelayMs', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            maxDelayMs: -1,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject maxDelayMs greater than the allowed maximum', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            maxDelayMs: 10_001,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject maxDelayMs smaller than initialDelayMs', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            initialDelayMs: 200,
            maxDelayMs: 100,
          }),
        ),
      ).rejects.toThrow(RangeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('should reject a non-function shouldRetry value', async () => {
      await expect(
        sut.execute(
          async () => 'result',
          createRetryOptions({
            shouldRetry:
              true as unknown as TransactionRetryOptions['shouldRetry'],
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------
  // CUSTOM RETRY CONDITIONS
  // --------------------------------------------------

  describe('custom retry conditions', () => {
    it('should retry when shouldRetry returns true', async () => {
      const retryableError = new RetryableContextError();

      let attempt = 0;

      transactionMock.mockImplementation(async (callback) => {
        const result = await callback(transactionClient);

        attempt += 1;

        if (attempt === 1) {
          throw retryableError;
        }

        return result;
      });

      const shouldRetry = vi.fn(
        (error: unknown) => error instanceof RetryableContextError,
      );

      const result = await sut.execute(
        async () => 'success',
        createRetryOptions({ shouldRetry }),
      );

      expect(result).toBe('success');
      expect(transactionMock).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledOnce();
      expect(shouldRetry).toHaveBeenCalledWith(retryableError);
    });

    it('should not retry when shouldRetry returns false', async () => {
      const operationError = new RetryableContextError();

      transactionMock.mockRejectedValue(operationError);

      const shouldRetry = vi.fn(() => false);

      await expect(
        sut.execute(async () => 'result', createRetryOptions({ shouldRetry })),
      ).rejects.toBe(operationError);

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(shouldRetry).toHaveBeenCalledOnce();
    });

    it('should retry P2034 even when shouldRetry returns false', async () => {
      const serializationError = createPrismaError('P2034');

      let attempt = 0;

      transactionMock.mockImplementation(async (callback) => {
        const result = await callback(transactionClient);

        attempt += 1;

        if (attempt === 1) {
          throw serializationError;
        }

        return result;
      });

      const shouldRetry = vi.fn(() => false);

      const result = await sut.execute(
        async () => 'success',
        createRetryOptions({ shouldRetry }),
      );

      expect(result).toBe('success');
      expect(transactionMock).toHaveBeenCalledTimes(2);
      expect(shouldRetry).not.toHaveBeenCalled();
    });

    it('should not retry when a custom retry condition does not match the error', async () => {
      const databaseError = createPrismaError('P2002');

      transactionMock.mockRejectedValue(databaseError);

      const shouldRetry = vi.fn(
        (error: unknown) => error instanceof RetryableContextError,
      );

      await expect(
        sut.execute(async () => 'result', createRetryOptions({ shouldRetry })),
      ).rejects.toBe(databaseError);

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(shouldRetry).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------
  // RETRY BACKOFF
  // --------------------------------------------------

  describe('retry backoff', () => {
    it('should apply exponential backoff with full jitter', async () => {
      vi.useFakeTimers();

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const serializationError = createPrismaError('P2034');

      let attempt = 0;

      transactionMock.mockImplementation(async (callback) => {
        const result = await callback(transactionClient);

        attempt += 1;

        if (attempt === 1) {
          throw serializationError;
        }

        return result;
      });

      try {
        const operation = sut.execute(
          async () => 'success',
          createRetryOptions({
            maxAttempts: 2,
            initialDelayMs: 100,
            maxDelayMs: 200,
          }),
        );

        // Full jitter: floor(0.5 * (100 + 1)) = 50ms.
        await vi.advanceTimersByTimeAsync(50);

        await expect(operation).resolves.toBe('success');

        expect(transactionMock).toHaveBeenCalledTimes(2);
        expect(randomSpy).toHaveBeenCalledOnce();
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });
});
