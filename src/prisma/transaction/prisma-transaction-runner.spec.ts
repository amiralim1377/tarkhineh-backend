import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma.service.js';

import { PrismaTransactionRunner } from './prisma-transaction-runner.js';
import { PrismaTransactionContext } from './prisma-transaction-context.js';

import type {
  TransactionContext,
  TransactionExecutionOptions,
} from '../../shared/application/ports/transaction-runner.port.js';

type TransactionCallback = (
  transaction: Prisma.TransactionClient,
) => Promise<unknown>;

const transactionMock = vi.fn();

const transactionClient = {} as Prisma.TransactionClient;

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
  overrides: Partial<{
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
  }> = {},
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

  describe('execute', () => {
    it('should execute the operation inside a Prisma transaction', async () => {
      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => callback(transactionClient),
      );

      const operation = vi.fn(
        async (_context: TransactionContext): Promise<string> => 'result',
      );

      await sut.execute(operation);

      expect(transactionMock).toHaveBeenCalledOnce();
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should provide a PrismaTransactionContext', async () => {
      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => callback(transactionClient),
      );

      let receivedContext: TransactionContext | undefined;

      await sut.execute(async (context) => {
        receivedContext = context;
      });

      expect(receivedContext).toBeInstanceOf(PrismaTransactionContext);
    });

    it('should provide the underlying Prisma transaction client', async () => {
      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => callback(transactionClient),
      );

      let receivedContext: PrismaTransactionContext | undefined;

      await sut.execute(async (context) => {
        receivedContext = context as PrismaTransactionContext;
      });

      expect(receivedContext?.getClient()).toBe(transactionClient);
    });

    it('should return the operation result', async () => {
      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => callback(transactionClient),
      );

      const expectedResult = {
        membershipInvitationId: 'invitation-123',
      };

      const result = await sut.execute(async () => expectedResult);

      expect(result).toEqual(expectedResult);
    });

    it('should propagate the original operation error', async () => {
      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => callback(transactionClient),
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

  describe('retry behavior', () => {
    it('should retry when a serialization conflict occurs', async () => {
      const serializationError = createPrismaError('P2034');

      let attempt = 0;

      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => {
          attempt += 1;

          const result = await callback(transactionClient);

          if (attempt < 3) {
            throw serializationError;
          }

          return result;
        },
      );

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

      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => {
          const currentAttempt = attempt++;

          const result = await callback(transactionClients[currentAttempt]!);

          if (currentAttempt < 2) {
            throw serializationError;
          }

          return result;
        },
      );

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

      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => {
          await callback(transactionClient);
          throw serializationError;
        },
      );

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
      transactionMock.mockImplementation(
        async (callback: TransactionCallback) => callback(transactionClient),
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
  });
});
