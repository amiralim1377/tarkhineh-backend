import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaMenuItemUnitOfWork } from './prisma-menu-item.unit-of-work.js';
import { PrismaMenuItemRepository } from './prisma-menu-item.repository.js';
import { PrismaMenuCategoryRepository } from './prisma-menu-category.repository.js';

import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';

import type { Prisma } from '../../../../generated/prisma/client.js';

import type {
  TransactionContext,
  TransactionRunner,
} from '../../../../shared/application/ports/transaction-runner.port.js';

import type { MenuItemUnitOfWorkContext } from '../../application/ports/menu-item-unit-of-work.port.js';

describe('PrismaMenuItemUnitOfWork', () => {
  let unitOfWork: PrismaMenuItemUnitOfWork;
  let transactionClient: Prisma.TransactionClient;
  let transactionContext: PrismaTransactionContext;

  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transactionClient = {} as Prisma.TransactionClient;

    transactionContext = new PrismaTransactionContext(transactionClient);

    executeMock = vi.fn(
      async (operation: (context: TransactionContext) => Promise<unknown>) => {
        return operation(transactionContext);
      },
    );

    const transactionRunner = {
      execute: executeMock,
    } as unknown as TransactionRunner;

    unitOfWork = new PrismaMenuItemUnitOfWork(transactionRunner);
  });

  describe('execute', () => {
    it('should execute the operation through TransactionRunner', async () => {
      // Arrange
      const operation = vi.fn(async () => undefined);

      // Act
      await unitOfWork.execute(operation);

      // Assert
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return the operation result', async () => {
      // Arrange
      const expectedResult = 'menu-item-created';

      // Act
      const result = await unitOfWork.execute(async () => expectedResult);

      // Assert
      expect(result).toBe(expectedResult);
    });

    it('should provide PrismaMenuItemRepository in the context', async () => {
      // Arrange
      let receivedContext: MenuItemUnitOfWorkContext | undefined;

      // Act
      await unitOfWork.execute(async (context) => {
        receivedContext = context;
      });

      // Assert
      expect(receivedContext?.menuItemRepository).toBeInstanceOf(
        PrismaMenuItemRepository,
      );
    });

    it('should provide PrismaMenuCategoryRepository in the context', async () => {
      // Arrange
      let receivedContext: MenuItemUnitOfWorkContext | undefined;

      // Act
      await unitOfWork.execute(async (context) => {
        receivedContext = context;
      });

      // Assert
      expect(receivedContext?.menuCategoryRepository).toBeInstanceOf(
        PrismaMenuCategoryRepository,
      );
    });

    it('should use the same transaction client for both repositories', async () => {
      // Arrange
      let receivedContext: MenuItemUnitOfWorkContext | undefined;

      // Act
      await unitOfWork.execute(async (context) => {
        receivedContext = context;
      });

      // Assert
      expect(receivedContext).toBeDefined();

      if (!receivedContext) {
        throw new Error('Transaction context was not provided.');
      }

      const menuItemRepository =
        receivedContext.menuItemRepository as unknown as {
          prisma: Prisma.TransactionClient;
        };

      const menuCategoryRepository =
        receivedContext.menuCategoryRepository as unknown as {
          prisma: Prisma.TransactionClient;
        };

      expect(menuItemRepository.prisma).toBe(transactionClient);
      expect(menuCategoryRepository.prisma).toBe(transactionClient);
    });

    it('should throw TypeError when transaction context is invalid', async () => {
      // Arrange
      const invalidTransactionRunner = {
        execute: async (
          operation: (context: TransactionContext) => Promise<unknown>,
        ) => {
          return operation({} as TransactionContext);
        },
      } as TransactionRunner;

      const invalidUnitOfWork = new PrismaMenuItemUnitOfWork(
        invalidTransactionRunner,
      );

      // Act & Assert
      await expect(
        invalidUnitOfWork.execute(async () => undefined),
      ).rejects.toThrow(TypeError);
    });

    it('should propagate errors thrown by the operation', async () => {
      // Arrange
      const expectedError = new Error('Menu item operation failed.');

      // Act
      const result = unitOfWork.execute(async () => {
        throw expectedError;
      });

      // Assert
      await expect(result).rejects.toBe(expectedError);
    });
  });
});
