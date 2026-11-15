import { Prisma } from '../../../../generated/prisma/client.js';
import { RetryableAccessControlTransactionError } from './retryable-access-control-transaction.error.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionOverride } from '../../domain/permission-overrides/permission-override.js';
import type { PersistedPermissionOverrideWithRelations } from './access-control-persistence.mapper.js';
import { PrismaPermissionOverrideRepository } from './prisma-permission-override.repository.js';

const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-01T12:00:00.000Z');

function createOverride(effect: 'ALLOW' | 'DENY' = 'DENY'): PermissionOverride {
  return PermissionOverride.create({
    id: 'override-1',
    organizationId: 'org-1',
    organizationMembership: {
      id: 'membership-1',
      organizationId: 'org-1',
    },
    branch: {
      id: 'branch-1',
      organizationId: 'org-1',
    },
    permissionCode: 'branch.dashboard.read',
    assignedById: 'actor-1',
    effect,
    createdAt: CREATED_AT,
  });
}

function createPersistedOverride(): PersistedPermissionOverrideWithRelations {
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
  } as PersistedPermissionOverrideWithRelations;
}

function createUniqueViolation(target: string[] | string): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: { target },
  });
}

function createSut() {
  const findOrganizationMembership = vi.fn();
  const findOrganizationMembershipById = vi.fn();
  const findBranch = vi.fn();
  const findBranchById = vi.fn();
  const findPermissionById = vi.fn();
  const findOverride = vi.fn();
  const createOverrideRecord = vi.fn();
  const updateOverrideRecord = vi.fn();
  const deleteOverrideRecord = vi.fn();

  const prisma = {
    organizationMembership: {
      findFirst: findOrganizationMembership,
      findUnique: findOrganizationMembershipById,
    },
    branch: {
      findFirst: findBranch,
      findUnique: findBranchById,
    },
    permission: {
      findUnique: findPermissionById,
    },
    userPermissionOverride: {
      findFirst: findOverride,
      create: createOverrideRecord,
      update: updateOverrideRecord,
      delete: deleteOverrideRecord,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    repository: new PrismaPermissionOverrideRepository(prisma),
    findOrganizationMembership,
    findOrganizationMembershipById,
    findBranch,
    findBranchById,
    findPermissionById,
    findOverride,
    createOverrideRecord,
    updateOverrideRecord,
    deleteOverrideRecord,
  };
}

describe('PrismaPermissionOverrideRepository', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  describe('findActiveTarget', () => {
    it('requires an active OrganizationMembership and Branch in the same Organization', async () => {
      sut.findOrganizationMembership.mockResolvedValue({
        id: 'membership-1',
        organizationId: 'org-1',
      });

      sut.findBranch.mockResolvedValue({
        id: 'branch-1',
        organizationId: 'org-1',
      });

      await expect(
        sut.repository.findActiveTarget({
          organizationId: 'org-1',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
        }),
      ).resolves.toEqual({
        organizationMembership: {
          id: 'membership-1',
          organizationId: 'org-1',
        },
        branch: {
          id: 'branch-1',
          organizationId: 'org-1',
        },
      });

      expect(sut.findOrganizationMembership).toHaveBeenCalledWith({
        where: {
          id: 'membership-1',
          organizationId: 'org-1',
          status: 'ACTIVE',
          organization: {
            is: {
              status: 'ACTIVE',
            },
          },
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      expect(sut.findBranch).toHaveBeenCalledWith({
        where: {
          id: 'branch-1',
          organizationId: 'org-1',
          status: 'ACTIVE',
          organization: {
            is: {
              status: 'ACTIVE',
            },
          },
        },
        select: {
          id: true,
          organizationId: true,
        },
      });
    });

    it('does not require BranchMembership', async () => {
      sut.findOrganizationMembership.mockResolvedValue({
        id: 'membership-1',
        organizationId: 'org-1',
      });
      sut.findBranch.mockResolvedValue({
        id: 'branch-1',
        organizationId: 'org-1',
      });

      await sut.repository.findActiveTarget({
        organizationId: 'org-1',
        organizationMembershipId: 'membership-1',
        branchId: 'branch-1',
      });

      expect(sut.findBranch).toHaveBeenCalledOnce();
      expect(sut.findOrganizationMembership).toHaveBeenCalledOnce();
      expect(sut.repository).toBeDefined();
    });

    it('returns null when either target is inactive, missing or belongs to another Organization', async () => {
      sut.findOrganizationMembership.mockResolvedValue({
        id: 'membership-1',
        organizationId: 'org-1',
      });
      sut.findBranch.mockResolvedValue(null);

      await expect(
        sut.repository.findActiveTarget({
          organizationId: 'org-1',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
        }),
      ).resolves.toBeNull();
    });
  });

  describe('findByUniqueKey', () => {
    it('loads the exact tenant, membership, Branch and Permission key', async () => {
      sut.findOverride.mockResolvedValue(createPersistedOverride());
      sut.findOrganizationMembershipById.mockResolvedValue({
        id: 'membership-1',
        organizationId: 'org-1',
      });
      sut.findBranchById.mockResolvedValue({
        id: 'branch-1',
        organizationId: 'org-1',
      });
      sut.findPermissionById.mockResolvedValue({
        code: 'branch.dashboard.read',
      });

      const result = await sut.repository.findByUniqueKey({
        organizationId: 'org-1',
        organizationMembershipId: 'membership-1',
        branchId: 'branch-1',
        permissionCode: 'branch.dashboard.read',
      });

      expect(sut.findOverride).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
          permission: {
            is: {
              code: 'branch.dashboard.read',
            },
          },
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

      expect(sut.findOrganizationMembershipById).toHaveBeenCalledWith({
        where: {
          id: 'membership-1',
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      expect(sut.findBranchById).toHaveBeenCalledWith({
        where: {
          id: 'branch-1',
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      expect(sut.findPermissionById).toHaveBeenCalledWith({
        where: {
          id: 'permission-1',
        },
        select: {
          code: true,
        },
      });

      expect(result).toBeInstanceOf(PermissionOverride);
      expect(result?.id).toBe('override-1');
      expect(result?.organizationId).toBe('org-1');
      expect(result?.organizationMembershipId).toBe('membership-1');
      expect(result?.branchId).toBe('branch-1');
      expect(result?.permissionCode).toBe('branch.dashboard.read');
      expect(result?.effect).toBe('DENY');
    });

    it('returns null when no Override matches the complete key', async () => {
      sut.findOverride.mockResolvedValue(null);

      await expect(
        sut.repository.findByUniqueKey({
          organizationId: 'org-1',
          organizationMembershipId: 'membership-1',
          branchId: 'branch-1',
          permissionCode: 'branch.dashboard.read',
        }),
      ).resolves.toBeNull();
    });
  });

  describe('save', () => {
    it('creates the Override using tenant-consistent relation connections', async () => {
      const override = createOverride();

      sut.createOverrideRecord.mockResolvedValue({
        id: override.id,
      });

      await sut.repository.save(override);

      expect(sut.createOverrideRecord).toHaveBeenCalledWith({
        data: {
          id: 'override-1',
          effect: 'DENY',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          organizationMembership: {
            connect: {
              id_organizationId: {
                id: 'membership-1',
                organizationId: 'org-1',
              },
            },
          },
          branch: {
            connect: {
              id_organizationId: {
                id: 'branch-1',
                organizationId: 'org-1',
              },
            },
          },
          assignedBy: {
            connect: {
              id: 'actor-1',
            },
          },
          permission: {
            connect: {
              code: 'branch.dashboard.read',
            },
          },
        },
      });
    });
  });

  describe('save unique conflicts', () => {
    it('signals a transaction retry only for the Override composite unique key', async () => {
      sut.createOverrideRecord.mockRejectedValue(
        createUniqueViolation([
          'organizationMembershipId',
          'branchId',
          'permissionId',
        ]),
      );

      await expect(
        sut.repository.save(createOverride()),
      ).rejects.toBeInstanceOf(RetryableAccessControlTransactionError);
    });

    it('does not classify unrelated unique violations as retryable', async () => {
      const error = createUniqueViolation(['id']);
      sut.createOverrideRecord.mockRejectedValue(error);

      await expect(sut.repository.save(createOverride())).rejects.toBe(error);
    });
  });

  describe('update', () => {
    it('updates only the mutable effect and timestamp', async () => {
      const override = createOverride('DENY');
      expect(override.changeEffect('ALLOW', UPDATED_AT)).toBe(true);

      sut.updateOverrideRecord.mockResolvedValue({
        id: override.id,
      });

      await sut.repository.update(override);

      expect(sut.updateOverrideRecord).toHaveBeenCalledWith({
        where: {
          id: 'override-1',
        },
        data: {
          effect: 'ALLOW',
          updatedAt: UPDATED_AT,
        },
      });
    });
  });

  describe('delete', () => {
    it('deletes the exact persisted Override by ID', async () => {
      const override = createOverride();

      sut.deleteOverrideRecord.mockResolvedValue({
        id: override.id,
      });

      await sut.repository.delete(override);

      expect(sut.deleteOverrideRecord).toHaveBeenCalledWith({
        where: {
          id: 'override-1',
        },
      });
    });
  });
});
