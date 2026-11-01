import { Prisma } from '../../../../generated/prisma/client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleAssignmentAlreadyExistsError } from '../../application/errors/role-assignment-already-exists.error.js';
import { Role } from '../../domain/roles/role.js';
import { RoleAssignment } from '../../domain/role-assignments/role-assignment.js';
import type {
  PersistedRoleAssignmentWithRelations,
} from './access-control-persistence.mapper.js';
import { PrismaRoleAssignmentRepository } from './prisma-role-assignment.repository.js';

const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const REVOKED_AT = new Date('2026-11-01T12:00:00.000Z');

function createBranchRole(): Role {
  return Role.create({
    id: 'role-1',
    code: 'BRANCH_MANAGER_CUSTOM',
    name: 'Branch Manager',
    definitionScope: 'ORGANIZATION',
    assignmentScope: 'BRANCH',
    organizationId: 'org-1',
    isAssignable: true,
    permissionCodes: ['branch.dashboard.read'],
  });
}

function createBranchAssignment(): RoleAssignment {
  return RoleAssignment.create({
    id: 'assignment-1',
    role: createBranchRole(),
    branchMembership: {
      id: 'branch-membership-1',
      organizationId: 'org-1',
    },
    assignedById: 'actor-1',
    createdAt: CREATED_AT,
  });
}

function createPersistedBranchAssignment(): PersistedRoleAssignmentWithRelations {
  return {
    id: 'assignment-1',
    roleId: 'role-1',
    organizationMembershipId: null,
    branchMembershipId: 'branch-membership-1',
    assignedById: 'actor-1',
    createdAt: CREATED_AT,
    revokedAt: null,
    role: {
      id: 'role-1',
      code: 'BRANCH_MANAGER_CUSTOM',
      name: 'Branch Manager',
      description: null,
      definitionScope: 'ORGANIZATION',
      assignmentScope: 'BRANCH',
      organizationId: 'org-1',
      isAssignable: true,
      status: 'ACTIVE',
      createdById: 'actor-1',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      permissions: [
        {
          roleId: 'role-1',
          permissionId: 'permission-1',
          createdAt: CREATED_AT,
          permission: {
            code: 'branch.dashboard.read',
          },
        },
      ],
    },
    organizationMembership: null,
    branchMembership: {
      id: 'branch-membership-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      organizationMembershipId: 'membership-1',
      status: 'ACTIVE',
    },
  } as PersistedRoleAssignmentWithRelations;
}

function createSut() {
  const findOrganizationMembership = vi.fn();
  const findOrganizationMembershipById = vi.fn();
  const findBranchMembership = vi.fn();
  const findBranchMembershipById = vi.fn();
  const findRole = vi.fn();
  const findAssignment = vi.fn();
  const createAssignment = vi.fn();
  const updateAssignment = vi.fn();

  const prisma = {
    organizationMembership: {
      findFirst: findOrganizationMembership,
      findUnique: findOrganizationMembershipById,
    },
    branchMembership: {
      findFirst: findBranchMembership,
      findUnique: findBranchMembershipById,
    },
    role: {
      findUnique: findRole,
    },
    roleAssignment: {
      findFirst: findAssignment,
      create: createAssignment,
      update: updateAssignment,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    repository: new PrismaRoleAssignmentRepository(prisma),
    findOrganizationMembership,
    findOrganizationMembershipById,
    findBranchMembership,
    findBranchMembershipById,
    findRole,
    findAssignment,
    createAssignment,
    updateAssignment,
  };
}

function createUniqueViolation(target: string[]): Error {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    {
      code: 'P2002',
      clientVersion: '7.10.1',
      meta: { target },
    },
  );
}

describe('PrismaRoleAssignmentRepository', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  describe('findActiveOrganizationMembership', () => {
    it('requires an active membership and active Organization', async () => {
      sut.findOrganizationMembership.mockResolvedValue({
        id: 'membership-1',
        organizationId: 'org-1',
      });

      await expect(
        sut.repository.findActiveOrganizationMembership(
          'org-1',
          'membership-1',
        ),
      ).resolves.toEqual({
        id: 'membership-1',
        organizationId: 'org-1',
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
    });

    it('returns null when the membership is inactive or unavailable', async () => {
      sut.findOrganizationMembership.mockResolvedValue(null);

      await expect(
        sut.repository.findActiveOrganizationMembership(
          'org-1',
          'membership-1',
        ),
      ).resolves.toBeNull();
    });
  });

  describe('findActiveBranchMembership', () => {
    it('requires an active BranchMembership, Branch and Organization', async () => {
      sut.findBranchMembership.mockResolvedValue({
        id: 'branch-membership-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      await expect(
        sut.repository.findActiveBranchMembership(
          'org-1',
          'branch-1',
          'branch-membership-1',
        ),
      ).resolves.toEqual({
        id: 'branch-membership-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      expect(sut.findBranchMembership).toHaveBeenCalledWith({
        where: {
          id: 'branch-membership-1',
          organizationId: 'org-1',
          branchId: 'branch-1',
          status: 'ACTIVE',
          branch: {
            is: {
              id: 'branch-1',
              organizationId: 'org-1',
              status: 'ACTIVE',
              organization: {
                is: {
                  status: 'ACTIVE',
                },
              },
            },
          },
          organizationMembership: {
            is: {
              organizationId: 'org-1',
              status: 'ACTIVE',
              organization: {
                is: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
        select: {
          id: true,
          organizationId: true,
          branchId: true,
        },
      });
    });

    it('returns null when the BranchMembership is inactive or inconsistent', async () => {
      sut.findBranchMembership.mockResolvedValue(null);

      await expect(
        sut.repository.findActiveBranchMembership(
          'org-1',
          'branch-1',
          'branch-membership-1',
        ),
      ).resolves.toBeNull();
    });
  });

  describe('existsActiveForTarget', () => {
    it('checks an active Organization Role assignment', async () => {
      sut.findAssignment.mockResolvedValue({ id: 'assignment-1' });

      await expect(
        sut.repository.existsActiveForTarget({
          roleId: 'role-1',
          organizationMembershipId: 'membership-1',
        }),
      ).resolves.toBe(true);

      expect(sut.findAssignment).toHaveBeenCalledWith({
        where: {
          roleId: 'role-1',
          revokedAt: null,
          organizationMembershipId: 'membership-1',
        },
        select: {
          id: true,
        },
      });
    });

    it('checks an active Branch Role assignment', async () => {
      sut.findAssignment.mockResolvedValue(null);

      await expect(
        sut.repository.existsActiveForTarget({
          roleId: 'role-1',
          branchMembershipId: 'branch-membership-1',
        }),
      ).resolves.toBe(false);

      expect(sut.findAssignment).toHaveBeenCalledWith({
        where: {
          roleId: 'role-1',
          revokedAt: null,
          branchMembershipId: 'branch-membership-1',
        },
        select: {
          id: true,
        },
      });
    });
  });

  describe('findByIdForRevocation', () => {
    it('loads a Branch assignment only in the supplied tenant and Branch context', async () => {
      const persistedAssignment = createPersistedBranchAssignment();

      sut.findAssignment.mockResolvedValue(persistedAssignment);
      sut.findRole.mockResolvedValue(persistedAssignment.role);
      sut.findBranchMembershipById.mockResolvedValue({
        id: 'branch-membership-1',
        organizationId: 'org-1',
      });

      const result = await sut.repository.findByIdForRevocation({
        organizationId: 'org-1',
        assignmentId: 'assignment-1',
        branchId: 'branch-1',
      });

      expect(sut.findAssignment).toHaveBeenCalledWith({
        where: {
          id: 'assignment-1',
          branchMembership: {
            is: {
              organizationId: 'org-1',
              branchId: 'branch-1',
            },
          },
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

      expect(sut.findRole).toHaveBeenCalledWith({
        where: {
          id: 'role-1',
        },
        include: expect.any(Object),
      });

      expect(sut.findBranchMembershipById).toHaveBeenCalledWith({
        where: {
          id: 'branch-membership-1',
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      expect(result).toBeInstanceOf(RoleAssignment);
      expect(result?.id).toBe('assignment-1');
      expect(result?.organizationId).toBe('org-1');
      expect(result?.branchMembershipId).toBe('branch-membership-1');
      expect(result?.organizationMembershipId).toBeNull();
    });

    it('returns null when the assignment does not match the target context', async () => {
      sut.findAssignment.mockResolvedValue(null);

      await expect(
        sut.repository.findByIdForRevocation({
          organizationId: 'org-1',
          assignmentId: 'assignment-1',
        }),
      ).resolves.toBeNull();

      expect(sut.findAssignment).toHaveBeenCalledWith({
        where: {
          id: 'assignment-1',
          organizationMembership: {
            is: {
              organizationId: 'org-1',
            },
          },
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
    });
  });

  describe('save', () => {
    it('persists exactly one membership target', async () => {
      const assignment = createBranchAssignment();

      sut.createAssignment.mockResolvedValue({
        id: assignment.id,
      });

      await sut.repository.save(assignment);

      expect(sut.createAssignment).toHaveBeenCalledWith({
        data: {
          id: 'assignment-1',
          roleId: 'role-1',
          organizationMembershipId: null,
          branchMembershipId: 'branch-membership-1',
          assignedById: 'actor-1',
          createdAt: CREATED_AT,
          revokedAt: null,
        },
      });
    });

    it('maps a partial unique assignment conflict to the Application error', async () => {
      sut.createAssignment.mockRejectedValue(
        createUniqueViolation([
          'branchMembershipId',
          'roleId',
        ]),
      );

      await expect(
        sut.repository.save(createBranchAssignment()),
      ).rejects.toBeInstanceOf(RoleAssignmentAlreadyExistsError);
    });

    it('does not misclassify unrelated unique violations', async () => {
      const error = createUniqueViolation(['id']);
      sut.createAssignment.mockRejectedValue(error);

      await expect(
        sut.repository.save(createBranchAssignment()),
      ).rejects.toBe(error);
    });
  });

  describe('update', () => {
    it('updates the revocation timestamp without rewriting assignment history', async () => {
      const assignment = createBranchAssignment();

      expect(assignment.revoke(REVOKED_AT)).toBe(true);

      sut.updateAssignment.mockResolvedValue({
        id: assignment.id,
      });

      await sut.repository.update(assignment);

      expect(sut.updateAssignment).toHaveBeenCalledWith({
        where: {
          id: 'assignment-1',
        },
        data: {
          revokedAt: REVOKED_AT,
        },
      });
    });
  });
});
