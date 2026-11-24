import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionContext,
  type TransactionRunner,
} from '../../../../shared/application/ports/transaction-runner.port.js';
import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';
import type {
  BranchMemberAdditionUnitOfWork,
  BranchMemberAdditionUnitOfWorkContext,
} from '../../application/ports/branch-member-addition-unit-of-work.port.js';
import { PrismaOrganizationMembershipRepository } from './prisma-organization-membership.repository.js';
import { PrismaBranchMembershipRepository } from './prisma-branch-membership.repository.js';

@Injectable()
export class PrismaBranchMemberAdditionUnitOfWork implements BranchMemberAdditionUnitOfWork {
  constructor(
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute<T>(
    operation: (context: BranchMemberAdditionUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    return this.transactionRunner.execute(async (transactionContext) => {
      const prismaTransactionContext =
        this.getPrismaTransactionContext(transactionContext);

      const transactionClient = prismaTransactionContext.getClient();

      const context: BranchMemberAdditionUnitOfWorkContext = {
        organizationMembershipRepository:
          new PrismaOrganizationMembershipRepository(transactionClient),

        branchMembershipRepository: new PrismaBranchMembershipRepository(
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
        'PrismaBranchMemberAdditionUnitOfWork requires a PrismaTransactionContext.',
      );
    }

    return context;
  }
}
