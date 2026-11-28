import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionContext,
  type TransactionRunner,
} from '../../../../shared/application/ports/transaction-runner.port.js';
import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';
import type {
  MenuItemUnitOfWork,
  MenuItemUnitOfWorkContext,
} from '../../application/ports/menu-item-unit-of-work.port.js';
import { PrismaMenuItemRepository } from './prisma-menu-item.repository.js';
import { PrismaMenuCategoryRepository } from './prisma-menu-category.repository.js';

@Injectable()
export class PrismaMenuItemUnitOfWork implements MenuItemUnitOfWork {
  constructor(
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute<T>(
    operation: (context: MenuItemUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    return this.transactionRunner.execute(async (transactionContext) => {
      const prismaTransactionContext =
        this.getPrismaTransactionContext(transactionContext);

      const transactionClient = prismaTransactionContext.getClient();

      const context: MenuItemUnitOfWorkContext = {
        menuItemRepository: new PrismaMenuItemRepository(transactionClient),
        menuCategoryRepository: new PrismaMenuCategoryRepository(
          transactionClient,
        ),
      };

      return operation(context);
    });
  }

  private getPrismaTransactionContext(
    context: TransactionContext,
  ): PrismaTransactionContext {
    if (!(context instanceof PrismaTransactionContext)) {
      throw new TypeError(
        'PrismaMenuItemUnitOfWork requires a PrismaTransactionContext.',
      );
    }

    return context;
  }
}
