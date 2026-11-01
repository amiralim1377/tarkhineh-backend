import { Prisma } from '../../../../generated/prisma/client.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { RoleAssignmentAlreadyExistsError } from '../../application/errors/role-assignment-already-exists.error.js';
import type { RoleAssignmentRepository } from '../../application/ports/role-assignment.repository.js';
import type { RoleAssignment } from '../../domain/role-assignments/role-assignment.js';
import {
  mapRoleAssignmentRecordToDomain,
  mapRoleToDomain,
  ROLE_WITH_PERMISSIONS,
} from './access-control-persistence.mapper.js';

export class PrismaRoleAssignmentRepository
  implements RoleAssignmentRepository
{
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  async findActiveOrganizationMembership(
    organizationId: string,
    organizationMembershipId: string,
  ): Promise<{ id: string; organizationId: string } | null> {
    try {
      return await this.prisma.organizationMembership.findFirst({
        where: {
          id: organizationMembershipId,
          organizationId,
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
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async findActiveBranchMembership(
    organizationId: string,
    branchId: string,
    branchMembershipId: string,
  ): Promise<{
    id: string;
    organizationId: string;
    branchId: string;
  } | null> {
    try {
      return await this.prisma.branchMembership.findFirst({
        where: {
          id: branchMembershipId,
          organizationId,
          branchId,
          status: 'ACTIVE',
          branch: {
            is: {
              id: branchId,
              organizationId,
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
              organizationId,
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
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async existsActiveForTarget(input: {
    readonly roleId: string;
    readonly organizationMembershipId?: string;
    readonly branchMembershipId?: string;
  }): Promise<boolean> {
    try {
      const record = await this.prisma.roleAssignment.findFirst({
        where: {
          roleId: input.roleId,
          revokedAt: null,
          ...(input.organizationMembershipId === undefined
            ? {}
            : { organizationMembershipId: input.organizationMembershipId }),
          ...(input.branchMembershipId === undefined
            ? {}
            : { branchMembershipId: input.branchMembershipId }),
        },
        select: {
          id: true,
        },
      });

      return record !== null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async findByIdForRevocation(input: {
    readonly organizationId: string;
    readonly assignmentId: string;
    readonly branchId?: string;
  }): Promise<RoleAssignment | null> {
    try {
      const targetFilter =
        input.branchId === undefined
          ? {
              organizationMembership: {
                is: {
                  organizationId: input.organizationId,
                },
              },
            }
          : {
              branchMembership: {
                is: {
                  organizationId: input.organizationId,
                  branchId: input.branchId,
                },
              },
            };

      const record = await this.prisma.roleAssignment.findFirst({
        where: {
          id: input.assignmentId,
          ...targetFilter,
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

      if (!record) {
        return null;
      }

      const roleRecord = await this.prisma.role.findUnique({
        where: {
          id: record.roleId,
        },
        include: ROLE_WITH_PERMISSIONS,
      });

      if (!roleRecord) {
        return null;
      }

      const organizationMembership =
        record.organizationMembershipId === null
          ? null
          : await this.prisma.organizationMembership.findUnique({
              where: {
                id: record.organizationMembershipId,
              },
              select: {
                id: true,
                organizationId: true,
              },
            });

      const branchMembership =
        record.branchMembershipId === null
          ? null
          : await this.prisma.branchMembership.findUnique({
              where: {
                id: record.branchMembershipId,
              },
              select: {
                id: true,
                organizationId: true,
              },
            });

      if (
        (record.organizationMembershipId !== null &&
          organizationMembership === null) ||
        (record.branchMembershipId !== null && branchMembership === null)
      ) {
        return null;
      }

      return mapRoleAssignmentRecordToDomain({
        record,
        role: mapRoleToDomain(roleRecord),
        organizationMembership,
        branchMembership,
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async save(assignment: RoleAssignment): Promise<void> {
    try {
      await this.prisma.roleAssignment.create({
        data: {
          id: assignment.id,
          roleId: assignment.roleId,
          organizationMembershipId: assignment.organizationMembershipId,
          branchMembershipId: assignment.branchMembershipId,
          assignedById: assignment.assignedById,
          createdAt: assignment.createdAt,
          revokedAt: assignment.revokedAt,
        },
      });
    } catch (error: unknown) {
      if (this.isActiveAssignmentUniqueViolation(error)) {
        throw new RoleAssignmentAlreadyExistsError();
      }

      throw normalizePrismaError(error);
    }
  }

  async update(assignment: RoleAssignment): Promise<void> {
    try {
      await this.prisma.roleAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          revokedAt: assignment.revokedAt,
        },
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private isActiveAssignmentUniqueViolation(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return (
        target.includes('roleId') &&
        (target.includes('organizationMembershipId') ||
          target.includes('branchMembershipId'))
      );
    }

    if (typeof target === 'string') {
      return (
        target.includes('RoleAssignment_organizationMembershipId_roleId') ||
        target.includes('RoleAssignment_branchMembershipId_roleId')
      );
    }

    return false;
  }
}
