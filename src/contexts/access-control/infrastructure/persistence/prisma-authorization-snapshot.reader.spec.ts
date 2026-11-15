import { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PrismaAuthorizationSnapshotReader,
  PrismaDefaultAuthorizationSnapshotReader,
} from './prisma-authorization-snapshot.reader.js';

const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-01T12:00:00.000Z');

function createPersistedOverride() {
  return {
    id: 'override-1',
    organizationId: 'org-1',
    organizationMembershipId: 'membership-1',
    branchId: 'branch-1',
    permissionId: 'permission-1',
    assignedById: 'actor-1',
    effect: 'DENY',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    organizationMembership: {
      id: 'membership-1',
      organizationId: 'org-1',
    },
    branch: {
      id: 'branch-1',
      organizationId: 'org-1',
    },
    permission: {
      code: 'branch.dashboard.read',
    },
  };
}

function createSut() {
  const organizationFindUnique = vi.fn();
  const membershipFindFirst = vi.fn();
  const branchFindFirst = vi.fn();
  const branchFindMany = vi.fn();
  const assignmentFindMany = vi.fn();
  const branchMembershipFindMany = vi.fn();
  const overrideFindMany = vi.fn();
  const roleFindMany = vi.fn();
  const permissionFindMany = vi.fn();
  const nestedTransaction = vi.fn();

  const prisma = {
    organization: {
      findUnique: organizationFindUnique,
    },
    organizationMembership: {
      findFirst: membershipFindFirst,
    },
    branch: {
      findFirst: branchFindFirst,
      findMany: branchFindMany,
    },
    roleAssignment: {
      findMany: assignmentFindMany,
    },
    role: {
      findMany: roleFindMany,
    },
    permission: {
      findMany: permissionFindMany,
    },
    branchMembership: {
      findMany: branchMembershipFindMany,
    },
    userPermissionOverride: {
      findMany: overrideFindMany,
    },
    $transaction: nestedTransaction,
  } as unknown as Prisma.TransactionClient;

  organizationFindUnique.mockResolvedValue({
    id: 'org-1',
    status: 'ACTIVE',
  });

  membershipFindFirst.mockResolvedValue({
    id: 'membership-1',
    userId: 'user-1',
    organizationId: 'org-1',
    status: 'ACTIVE',
  });

  branchFindFirst.mockResolvedValue({
    id: 'branch-1',
    organizationId: 'org-1',
    status: 'ACTIVE',
  });

  branchFindMany.mockResolvedValue([]);
  assignmentFindMany.mockResolvedValue([]);
  branchMembershipFindMany.mockResolvedValue([]);
  overrideFindMany.mockResolvedValue([]);
  roleFindMany.mockResolvedValue([]);
  permissionFindMany.mockResolvedValue([]);

  return {
    reader: new PrismaAuthorizationSnapshotReader(prisma),
    prisma,
    organizationFindUnique,
    membershipFindFirst,
    branchFindFirst,
    branchFindMany,
    assignmentFindMany,
    branchMembershipFindMany,
    overrideFindMany,
    roleFindMany,
    permissionFindMany,
    nestedTransaction,
  };
}

describe('PrismaAuthorizationSnapshotReader', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  describe('loadSnapshot', () => {
    it('loads an Organization snapshot without querying Branch-specific records', async () => {
      const result = await sut.reader.loadSnapshot({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(result.organization).toEqual({
        id: 'org-1',
        status: 'ACTIVE',
      });

      expect(result.organizationMembership).toEqual({
        id: 'membership-1',
        userId: 'user-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
      });

      expect(result.branch).toBeNull();
      expect(result.branchMemberships).toEqual([]);
      expect(result.roles).toEqual([]);
      expect(result.roleAssignments).toEqual([]);
      expect(result.permissionOverrides).toEqual([]);

      expect(sut.branchFindFirst).not.toHaveBeenCalled();
      expect(sut.branchMembershipFindMany).not.toHaveBeenCalled();
      expect(sut.overrideFindMany).not.toHaveBeenCalled();

      expect(sut.assignmentFindMany).toHaveBeenCalledWith({
        where: {
          revokedAt: null,
          OR: [
            {
              organizationMembershipId: 'membership-1',
            },
          ],
        },
        select: {
          id: true,
          roleId: true,
          organizationMembershipId: true,
          branchMembershipId: true,
          assignedById: true,
          createdAt: true,
          revokedAt: true,
        },
      });

      expect(sut.nestedTransaction).not.toHaveBeenCalled();
    });

    it('loads Branch assignments, memberships and overrides for the exact Branch', async () => {
      sut.branchMembershipFindMany.mockResolvedValue([
        {
          id: 'branch-membership-1',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
          organizationId: 'org-1',
          status: 'ACTIVE',
        },
        {
          id: 'branch-membership-2',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
          organizationId: 'org-1',
          status: 'SUSPENDED',
        },
      ]);

      sut.overrideFindMany.mockResolvedValue([createPersistedOverride()]);
      sut.permissionFindMany.mockResolvedValue([
        {
          id: 'permission-1',
          code: 'branch.dashboard.read',
        },
      ]);

      const result = await sut.reader.loadSnapshot({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      expect(result.branch).toEqual({
        id: 'branch-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
      });

      expect(result.branchMemberships).toHaveLength(2);
      expect(result.branchMemberships?.[0]).toEqual({
        id: 'branch-membership-1',
        organizationMembershipId: 'membership-1',
        branchId: 'branch-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
      });
      expect(result.branchMemberships?.[1]?.status).toBe('SUSPENDED');

      expect(result.permissionOverrides).toHaveLength(1);
      expect(result.permissionOverrides?.[0]).toMatchObject({
        id: 'override-1',
        organizationId: 'org-1',
        organizationMembershipId: 'membership-1',
        branchId: 'branch-1',
        permissionCode: 'branch.dashboard.read',
        effect: 'DENY',
      });

      expect(sut.assignmentFindMany).toHaveBeenCalledWith({
        where: {
          revokedAt: null,
          OR: [
            {
              organizationMembershipId: 'membership-1',
            },
            {
              branchMembership: {
                is: {
                  organizationId: 'org-1',
                  branchId: 'branch-1',
                  organizationMembershipId: 'membership-1',
                },
              },
            },
          ],
        },
        select: {
          id: true,
          roleId: true,
          organizationMembershipId: true,
          branchMembershipId: true,
          assignedById: true,
          createdAt: true,
          revokedAt: true,
        },
      });

      expect(sut.branchMembershipFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          branchId: 'branch-1',
          organizationMembershipId: 'membership-1',
        },
        select: {
          id: true,
          organizationMembershipId: true,
          branchId: true,
          organizationId: true,
          status: true,
        },
      });

      expect(sut.overrideFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
        },
        select: {
          id: true,
          organizationId: true,
          organizationMembershipId: true,
          branchId: true,
          permissionId: true,
          assignedById: true,
          effect: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      expect(sut.permissionFindMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['permission-1'],
          },
        },
        select: {
          id: true,
          code: true,
        },
      });

      expect(sut.nestedTransaction).not.toHaveBeenCalled();
    });

    it('fails closed when the OrganizationMembership does not exist', async () => {
      sut.membershipFindFirst.mockResolvedValue(null);

      const result = await sut.reader.loadSnapshot({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      expect(result.organization).toEqual({
        id: 'org-1',
        status: 'ACTIVE',
      });
      expect(result.organizationMembership).toBeNull();
      expect(result.roles).toEqual([]);
      expect(result.roleAssignments).toEqual([]);
      expect(result.permissionOverrides).toEqual([]);

      expect(sut.assignmentFindMany).not.toHaveBeenCalled();
      expect(sut.branchMembershipFindMany).not.toHaveBeenCalled();
      expect(sut.overrideFindMany).not.toHaveBeenCalled();
    });
  });

  describe('loadDelegationSnapshots', () => {
    it('loads exactly one snapshot for every active Branch', async () => {
      sut.branchFindMany.mockResolvedValue([
        { id: 'branch-1' },
        { id: 'branch-2' },
      ]);

      sut.branchFindFirst.mockImplementation(async ({ where }) => ({
        id: where.id,
        organizationId: 'org-1',
        status: 'ACTIVE',
      }));

      const result = await sut.reader.loadDelegationSnapshots({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(sut.branchFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      expect(result.organizationSnapshot.branch).toBeNull();

      expect(
        result.activeBranchSnapshots.map(
          (snapshot) => snapshot.branch?.id,
        ),
      ).toEqual(['branch-1', 'branch-2']);

      expect(result.activeBranchSnapshots).toHaveLength(2);
      expect(sut.branchFindFirst).toHaveBeenCalledTimes(2);
      expect(sut.assignmentFindMany).toHaveBeenCalledTimes(3);
      expect(sut.nestedTransaction).not.toHaveBeenCalled();
    });

    it('returns no Branch snapshots when no active Branch exists', async () => {
      sut.branchFindMany.mockResolvedValue([]);

      const result = await sut.reader.loadDelegationSnapshots({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(result.activeBranchSnapshots).toEqual([]);
      expect(sut.branchFindFirst).not.toHaveBeenCalled();
      expect(sut.assignmentFindMany).toHaveBeenCalledOnce();
    });
  });
});

describe('PrismaDefaultAuthorizationSnapshotReader', () => {
  it('wraps each standalone read in a RepeatableRead transaction', async () => {
    const tx = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'org-1',
          status: 'ACTIVE',
        }),
      },
      organizationMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Prisma.TransactionClient;

    const transaction = vi.fn(
      async (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => operation(tx),
    );

    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;

    const reader = new PrismaDefaultAuthorizationSnapshotReader(prisma);

    const result = await reader.loadSnapshot({
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(result.organizationMembership).toBeNull();

    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 10_000,
        timeout: 30_000,
      }),
    );
  });

  it('uses one RepeatableRead transaction for the entire delegation snapshot load', async () => {
    const tx = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'org-1',
          status: 'ACTIVE',
        }),
      },
      organizationMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'branch-1' },
          { id: 'branch-2' },
        ]),
        findFirst: vi.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          organizationId: 'org-1',
          status: 'ACTIVE',
        })),
      },
    } as unknown as Prisma.TransactionClient;

    const transaction = vi.fn(
      async (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => operation(tx),
    );

    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;

    const reader = new PrismaDefaultAuthorizationSnapshotReader(prisma);

    const result = await reader.loadDelegationSnapshots({
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(
      result.activeBranchSnapshots.map((snapshot) => snapshot.branch?.id),
    ).toEqual(['branch-1', 'branch-2']);
    expect(transaction).toHaveBeenCalledOnce();

    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }),
    );
  });
});
