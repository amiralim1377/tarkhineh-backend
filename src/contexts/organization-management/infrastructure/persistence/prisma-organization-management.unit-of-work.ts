import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionContext,
  type TransactionRunner,
} from '../../../../shared/application/ports/transaction-runner.port.js';
import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';
import {
  OUTBOUND_EMAIL_ENQUEUE,
  type OutboundEmailEnqueuePort,
} from '../../../outbound-email/contracts/outbound-email-enqueue.contract.js';
import type {
  OrganizationManagementUnitOfWork,
  OrganizationManagementUnitOfWorkContext,
} from '../../application/ports/organization-management-unit-of-work.port.js';
import { PrismaMembershipInvitationRepository } from './prisma-membership-invitation.repository.js';
import { OutboundMembershipInvitationEmailAdapter } from '../email/infrastructure/email/outbound-membership-invitation-email.adapter.js';

@Injectable()
export class PrismaOrganizationManagementUnitOfWork implements OrganizationManagementUnitOfWork {
  constructor(
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,

    @Inject(OUTBOUND_EMAIL_ENQUEUE)
    private readonly outboundEmailEnqueue: OutboundEmailEnqueuePort,
  ) {}

  async execute<T>(
    operation: (context: OrganizationManagementUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    return this.transactionRunner.execute(async (transactionContext) => {
      const prismaTransactionContext =
        this.getPrismaTransactionContext(transactionContext);

      const transactionClient = prismaTransactionContext.getClient();

      const context: OrganizationManagementUnitOfWorkContext = {
        membershipInvitationRepository:
          new PrismaMembershipInvitationRepository(transactionClient),

        membershipInvitationEmail: new OutboundMembershipInvitationEmailAdapter(
          this.outboundEmailEnqueue,
          transactionContext,
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
        'PrismaOrganizationManagementUnitOfWork requires a PrismaTransactionContext.',
      );
    }

    return context;
  }
}
