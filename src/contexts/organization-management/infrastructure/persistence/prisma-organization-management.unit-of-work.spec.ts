import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';

import type {
  TransactionContext,
  TransactionRunner,
} from '../../../../shared/application/ports/transaction-runner.port.js';

import type { OutboundEmailEnqueuePort } from '../../../outbound-email/contracts/outbound-email-enqueue.contract.js';

import type { OrganizationManagementUnitOfWorkContext } from '../../application/ports/organization-management-unit-of-work.port.js';

import { PrismaMembershipInvitationRepository } from './prisma-membership-invitation.repository.js';
import { PrismaOrganizationManagementUnitOfWork } from './prisma-organization-management.unit-of-work.js';
import { OutboundMembershipInvitationEmailAdapter } from '../email/infrastructure/email/outbound-membership-invitation-email.adapter.js';

// ============================================================
// TRANSACTION FIXTURES
// ============================================================

function createTransactionFixture() {
  const membershipInvitationDelegate = {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  };

  const transactionClient = {
    membershipInvitation: membershipInvitationDelegate,
  };

  const transactionContext = new PrismaTransactionContext(
    transactionClient as unknown as Prisma.TransactionClient,
  );

  return {
    transactionClient,
    transactionContext,
    membershipInvitationDelegate,
  };
}

// ============================================================
// MOCKS
// ============================================================

type TransactionExecute = TransactionRunner['execute'];

const transactionRunnerMock = {
  execute: vi.fn<TransactionExecute>(),
};

const outboundEmailEnqueueMock = {
  enqueue: vi.fn<OutboundEmailEnqueuePort['enqueue']>(),
};

// ============================================================
// FIXTURES
// ============================================================

function createInvitationEmailInput() {
  return {
    invitationId: 'invitation-123',
    email: 'employee@example.com',
    rawToken: 'secure-token-123',
    scope: 'ORGANIZATION' as const,
    organizationName: 'Tarkhineh',
    expiresAt: new Date(Date.now() + 60_000),
  };
}

// ============================================================
// TEST SUITE
// ============================================================

describe('PrismaOrganizationManagementUnitOfWork', () => {
  let sut: PrismaOrganizationManagementUnitOfWork;

  let primaryFixture: ReturnType<typeof createTransactionFixture>;

  beforeEach(() => {
    vi.clearAllMocks();

    primaryFixture = createTransactionFixture();

    transactionRunnerMock.execute.mockImplementation(async (operation) =>
      operation(primaryFixture.transactionContext),
    );

    outboundEmailEnqueueMock.enqueue.mockResolvedValue({
      messageId: 'email-message-123',
    });

    sut = new PrismaOrganizationManagementUnitOfWork(
      transactionRunnerMock as unknown as TransactionRunner,
      outboundEmailEnqueueMock,
    );
  });

  // ==========================================================
  // TRANSACTION EXECUTION
  // ==========================================================

  describe('execute', () => {
    it('should execute the operation through TransactionRunner', async () => {
      await sut.execute(async () => undefined);

      expect(transactionRunnerMock.execute).toHaveBeenCalledOnce();
    });

    it('should return the operation result', async () => {
      const expectedResult = {
        invitationId: 'invitation-123',
        created: true,
      };

      const result = await sut.execute(async () => expectedResult);

      expect(result).toEqual(expectedResult);
    });

    it('should execute the operation exactly once when TransactionRunner invokes it once', async () => {
      const operation = vi.fn(async () => 'completed');

      await sut.execute(operation);

      expect(operation).toHaveBeenCalledOnce();
    });

    it('should propagate operation errors without replacing them', async () => {
      const applicationError = new Error(
        'Intentional organization management failure.',
      );

      await expect(
        sut.execute(async () => {
          throw applicationError;
        }),
      ).rejects.toBe(applicationError);
    });

    it('should propagate TransactionRunner errors', async () => {
      const transactionError = new Error('Transaction execution failed.');

      transactionRunnerMock.execute.mockRejectedValueOnce(transactionError);

      await expect(sut.execute(async () => undefined)).rejects.toBe(
        transactionError,
      );
    });

    it('should not execute the operation when TransactionRunner fails before invoking it', async () => {
      transactionRunnerMock.execute.mockRejectedValueOnce(
        new Error('Transaction could not start.'),
      );

      const operation = vi.fn(async () => undefined);

      await expect(sut.execute(operation)).rejects.toThrow(
        'Transaction could not start.',
      );

      expect(operation).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // UNIT OF WORK CONTEXT
  // ==========================================================

  describe('transaction context', () => {
    it('should provide a PrismaMembershipInvitationRepository', async () => {
      await sut.execute(async (context) => {
        expect(context.membershipInvitationRepository).toBeInstanceOf(
          PrismaMembershipInvitationRepository,
        );
      });
    });

    it('should provide an OutboundMembershipInvitationEmailAdapter', async () => {
      await sut.execute(async (context) => {
        expect(context.membershipInvitationEmail).toBeInstanceOf(
          OutboundMembershipInvitationEmailAdapter,
        );
      });
    });

    it('should provide both required application ports', async () => {
      await sut.execute(async (context) => {
        const keys = Object.keys(context).sort();

        expect(keys).toEqual([
          'membershipInvitationEmail',
          'membershipInvitationRepository',
        ]);
      });
    });

    it('should create a new context for every execution', async () => {
      const contexts: OrganizationManagementUnitOfWorkContext[] = [];

      await sut.execute(async (context) => {
        contexts.push(context);
      });

      await sut.execute(async (context) => {
        contexts.push(context);
      });

      expect(contexts).toHaveLength(2);

      expect(contexts[0]).not.toBe(contexts[1]);

      expect(contexts[0]?.membershipInvitationRepository).not.toBe(
        contexts[1]?.membershipInvitationRepository,
      );

      expect(contexts[0]?.membershipInvitationEmail).not.toBe(
        contexts[1]?.membershipInvitationEmail,
      );
    });
  });

  // ==========================================================
  // SHARED TRANSACTION
  // ==========================================================

  describe('shared transaction', () => {
    it('should bind the invitation repository to the supplied transaction client', async () => {
      await sut.execute(async (context) => {
        expect(primaryFixture.transactionContext.getClient()).toBe(
          primaryFixture.transactionClient,
        );

        await context.membershipInvitationRepository.findById(
          'organization-123',
          'invitation-123',
        );

        expect(
          primaryFixture.membershipInvitationDelegate.findUnique,
        ).toHaveBeenCalledWith({
          where: {
            id: 'invitation-123',
            organizationId: 'organization-123',
          },
        });
      });
    });

    it('should pass the same transaction context to Outbound Email', async () => {
      await sut.execute(async (context) => {
        await context.membershipInvitationEmail.enqueueInvitationEmail(
          createInvitationEmailInput(),
        );
      });

      expect(outboundEmailEnqueueMock.enqueue).toHaveBeenCalledOnce();

      const call = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(call[1]).toBe(primaryFixture.transactionContext);

      expect(call[1]).toBeInstanceOf(PrismaTransactionContext);

      expect((call[1] as PrismaTransactionContext).getClient()).toBe(
        primaryFixture.transactionClient,
      );
    });

    it('should use the same transaction context for invitation repository and email adapter', async () => {
      await sut.execute(async (context) => {
        await context.membershipInvitationRepository.findById(
          'organization-123',
          'invitation-123',
        );

        await context.membershipInvitationEmail.enqueueInvitationEmail(
          createInvitationEmailInput(),
        );
      });

      expect(
        primaryFixture.membershipInvitationDelegate.findUnique,
      ).toHaveBeenCalledOnce();

      const emailCall = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailCall[1]).toBe(primaryFixture.transactionContext);
    });

    it('should not create an independent Prisma transaction', async () => {
      await sut.execute(async (context) => {
        expect(context.membershipInvitationRepository).toBeDefined();
        expect(context.membershipInvitationEmail).toBeDefined();
      });

      expect(transactionRunnerMock.execute).toHaveBeenCalledOnce();

      expect(primaryFixture.transactionClient).not.toHaveProperty(
        '$transaction',
      );
    });
  });

  // ==========================================================
  // RETRY BEHAVIOR
  // ==========================================================

  describe('transaction retry behavior', () => {
    it('should create new transaction-bound ports when the operation is executed again', async () => {
      const firstFixture = createTransactionFixture();
      const secondFixture = createTransactionFixture();

      const capturedContexts: OrganizationManagementUnitOfWorkContext[] = [];

      transactionRunnerMock.execute.mockImplementation(async (operation) => {
        await operation(firstFixture.transactionContext);

        return operation(secondFixture.transactionContext);
      });

      await sut.execute(async (context) => {
        capturedContexts.push(context);
      });

      expect(capturedContexts).toHaveLength(2);

      expect(capturedContexts[0]).not.toBe(capturedContexts[1]);

      expect(capturedContexts[0]?.membershipInvitationRepository).not.toBe(
        capturedContexts[1]?.membershipInvitationRepository,
      );

      expect(capturedContexts[0]?.membershipInvitationEmail).not.toBe(
        capturedContexts[1]?.membershipInvitationEmail,
      );
    });

    it('should bind each execution to its own transaction client', async () => {
      const firstFixture = createTransactionFixture();
      const secondFixture = createTransactionFixture();

      transactionRunnerMock.execute.mockImplementation(async (operation) => {
        await operation(firstFixture.transactionContext);

        return operation(secondFixture.transactionContext);
      });

      const usedTransactionContexts: TransactionContext[] = [];

      await sut.execute(async (context) => {
        await context.membershipInvitationEmail.enqueueInvitationEmail(
          createInvitationEmailInput(),
        );

        const call = outboundEmailEnqueueMock.enqueue.mock.calls.at(-1);

        if (!call) {
          throw new Error('Expected an Outbound Email enqueue call.');
        }

        usedTransactionContexts.push(call[1]);
      });

      expect(usedTransactionContexts).toHaveLength(2);

      expect(usedTransactionContexts[0]).toBe(firstFixture.transactionContext);

      expect(usedTransactionContexts[1]).toBe(secondFixture.transactionContext);

      expect(
        (usedTransactionContexts[0] as PrismaTransactionContext).getClient(),
      ).toBe(firstFixture.transactionClient);

      expect(
        (usedTransactionContexts[1] as PrismaTransactionContext).getClient(),
      ).toBe(secondFixture.transactionClient);
    });
  });

  // ==========================================================
  // INVALID TRANSACTION CONTEXT
  // ==========================================================

  describe('transaction context validation', () => {
    it('should reject a transaction context that is not a PrismaTransactionContext', async () => {
      transactionRunnerMock.execute.mockImplementation(async (operation) =>
        operation({} as TransactionContext),
      );

      await expect(sut.execute(async () => undefined)).rejects.toThrow(
        'PrismaOrganizationManagementUnitOfWork requires a PrismaTransactionContext.',
      );
    });

    it('should not invoke the operation when the transaction context is invalid', async () => {
      transactionRunnerMock.execute.mockImplementation(async (operation) =>
        operation({} as TransactionContext),
      );

      const operation = vi.fn(async () => undefined);

      await expect(sut.execute(operation)).rejects.toThrow(TypeError);

      expect(operation).not.toHaveBeenCalled();
    });
  });
});
