import { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaAccessControlUnitOfWork } from './prisma-access-control.unit-of-work.js';

function createSerializationConflict(): Error {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock.',
    {
      code: 'P2034',
      clientVersion: '7.10.1',
    },
  );
}

function createTransactionClient() {
  const organizationFindUnique = vi.fn().mockResolvedValue(null);
  const organizationMembershipFindFirst = vi.fn().mockResolvedValue({
    id: 'membership-1',
    organizationId: 'org-1',
    userId: 'user-1',
    status: 'ACTIVE',
  });
  const branchFindFirst = vi.fn().mockResolvedValue(null);
  const branchFindMany = vi.fn().mockResolvedValue([]);
  const roleFindFirst = vi.fn().mockResolvedValue(null);
  const roleCreate = vi.fn().mockResolvedValue({ id: 'role-1' });
  const roleUpdate = vi.fn().mockResolvedValue({ id: 'role-1' });
  const assignmentFindFirst = vi.fn().mockResolvedValue(null);
  const assignmentFindMany = vi.fn().mockResolvedValue([]);
  const assignmentCreate = vi.fn().mockResolvedValue({ id: 'assignment-1' });
  const assignmentUpdate = vi.fn().mockResolvedValue({ id: 'assignment-1' });
  const branchMembershipFindFirst = vi.fn().mockResolvedValue(null);
  const branchMembershipFindMany = vi.fn().mockResolvedValue([]);
  const overrideFindFirst = vi.fn().mockResolvedValue(null);
  const overrideFindMany = vi.fn().mockResolvedValue([]);
  const overrideCreate = vi.fn().mockResolvedValue({ id: 'override-1' });
  const overrideUpdate = vi.fn().mockResolvedValue({ id: 'override-1' });
  const overrideDelete = vi.fn().mockResolvedValue({ id: 'override-1' });

  const tx = {
    organization: {
      findUnique: organizationFindUnique,
    },
    organizationMembership: {
      findFirst: organizationMembershipFindFirst,
    },
    branch: {
      findFirst: branchFindFirst,
      findMany: branchFindMany,
    },
    role: {
      findFirst: roleFindFirst,
      create: roleCreate,
      update: roleUpdate,
    },
    roleAssignment: {
      findFirst: assignmentFindFirst,
      findMany: assignmentFindMany,
      create: assignmentCreate,
      update: assignmentUpdate,
    },
    branchMembership: {
      findFirst: branchMembershipFindFirst,
      findMany: branchMembershipFindMany,
    },
    userPermissionOverride: {
      findFirst: overrideFindFirst,
      findMany: overrideFindMany,
      create: overrideCreate,
      update: overrideUpdate,
      delete: overrideDelete,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    organizationFindUnique,
    organizationMembershipFindFirst,
    branchFindFirst,
    branchFindMany,
    roleFindFirst,
    assignmentFindFirst,
    branchMembershipFindFirst,
    overrideFindFirst,
  };
}

function createSut() {
  const transactionClient = createTransactionClient();

  const transaction = vi.fn(
    async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => operation(transactionClient.tx),
  );

  const prisma = {
    $transaction: transaction,
  } as unknown as PrismaService;

  return {
    unitOfWork: new PrismaAccessControlUnitOfWork(prisma),
    transaction,
    ...transactionClient,
  };
}

describe('PrismaAccessControlUnitOfWork', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('executes the operation with all adapters bound to one Serializable transaction', async () => {
    const result = await sut.unitOfWork.execute(async (context) => {
      await context.roleRepository.existsByCode('org-1', 'SALES_MANAGER');

      await context.roleAssignmentRepository.findActiveOrganizationMembership(
        'org-1',
        'membership-1',
      );

      await context.permissionOverrideRepository.findActiveTarget({
        organizationId: 'org-1',
        organizationMembershipId: 'membership-1',
        branchId: 'branch-1',
      });

      const snapshot = await context.authorizationSnapshotReader.loadSnapshot({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      return snapshot;
    });

    expect(result.organization).toBeNull();

    expect(sut.transaction).toHaveBeenCalledOnce();
    expect(sut.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    expect(sut.roleFindFirst).toHaveBeenCalledOnce();
    expect(sut.organizationMembershipFindFirst).toHaveBeenCalled();
    expect(sut.branchFindFirst).toHaveBeenCalledOnce();
    expect(sut.overrideFindFirst).not.toHaveBeenCalled();
    expect(sut.organizationFindUnique).toHaveBeenCalledOnce();
  });

  it('preserves and propagates the original Application error', async () => {
    const applicationError = new Error('Authorization forbidden');

    await expect(
      sut.unitOfWork.execute(async () => {
        throw applicationError;
      }),
    ).rejects.toBe(applicationError);

    expect(sut.transaction).toHaveBeenCalledOnce();
  });

  it('retries the complete operation after a P2034 conflict', async () => {
    const conflict = createSerializationConflict();
    let transactionAttempt = 0;

    sut.transaction.mockImplementation(async (operation) => {
      transactionAttempt += 1;

      await operation(sut.tx);

      if (transactionAttempt === 1) {
        throw conflict;
      }

      return 'committed';
    });

    const operation = vi.fn(async () => 'result');

    await expect(
      sut.unitOfWork.execute(operation),
    ).resolves.toBe('committed');

    expect(sut.transaction).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('stops after three attempts and propagates the final P2034 conflict', async () => {
    const conflict = createSerializationConflict();

    sut.transaction.mockRejectedValue(conflict);

    const operation = vi.fn(async () => 'result');

    await expect(
      sut.unitOfWork.execute(operation),
    ).rejects.toBe(conflict);

    expect(sut.transaction).toHaveBeenCalledTimes(3);
    expect(operation).not.toHaveBeenCalled();
  });

  it('does not retry non-serialization errors', async () => {
    const persistenceError = new Error('Foreign key constraint failed');

    sut.transaction.mockRejectedValue(persistenceError);

    await expect(
      sut.unitOfWork.execute(async () => 'result'),
    ).rejects.toBe(persistenceError);

    expect(sut.transaction).toHaveBeenCalledOnce();
  });

  it('does not retry unrelated Prisma known request errors', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed.',
      {
        code: 'P2002',
        clientVersion: '7.10.1',
      },
    );

    sut.transaction.mockRejectedValue(conflict);

    await expect(
      sut.unitOfWork.execute(async () => 'result'),
    ).rejects.toBe(conflict);

    expect(sut.transaction).toHaveBeenCalledOnce();
  });

  it('normalizes database connectivity errors after leaving the retry loop', async () => {
    const databaseError = new Prisma.PrismaClientKnownRequestError(
      'Database server is not reachable.',
      {
        code: 'P1001',
        clientVersion: '7.10.1',
      },
    );

    sut.transaction.mockRejectedValue(databaseError);

    await expect(
      sut.unitOfWork.execute(async () => 'result'),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);

    expect(sut.transaction).toHaveBeenCalledOnce();
  });
});
