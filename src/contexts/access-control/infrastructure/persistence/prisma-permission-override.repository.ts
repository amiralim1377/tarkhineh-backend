import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { PermissionOverrideRepository } from '../../application/ports/permission-override.repository.js';
import type { PermissionOverride } from '../../domain/permission-overrides/permission-override.js';
import {
  mapPermissionOverrideRecordToDomain,
} from './access-control-persistence.mapper.js';

export class PrismaPermissionOverrideRepository
  implements PermissionOverrideRepository
{
  constructor(
    private readonly prisma: import('../../../../generated/prisma/client.js').Prisma.TransactionClient,
  ) {}

  async findActiveTarget(input: {
    readonly organizationId: string;
    readonly organizationMembershipId: string;
    readonly branchId: string;
  }) {
    try {
      const membership =
        await this.prisma.organizationMembership.findFirst({
          where: {
            id: input.organizationMembershipId,
            organizationId: input.organizationId,
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

      if (!membership) {
        return null;
      }

      const branch = await this.prisma.branch.findFirst({
        where: {
          id: input.branchId,
          organizationId: input.organizationId,
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

      if (!branch) {
        return null;
      }

      return {
        organizationMembership: membership,
        branch,
      };
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async findByUniqueKey(input: {
    readonly organizationId: string;
    readonly organizationMembershipId: string;
    readonly branchId: string;
    readonly permissionCode: string;
  }): Promise<PermissionOverride | null> {
    try {
      const record = await this.prisma.userPermissionOverride.findFirst({
        where: {
          organizationId: input.organizationId,
          organizationMembershipId: input.organizationMembershipId,
          branchId: input.branchId,
          permission: {
            is: {
              code: input.permissionCode,
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

      if (!record) {
        return null;
      }

      const organizationMembership =
        await this.prisma.organizationMembership.findUnique({
          where: {
            id: record.organizationMembershipId,
          },
          select: {
            id: true,
            organizationId: true,
          },
        });

      const branch = await this.prisma.branch.findUnique({
        where: {
          id: record.branchId,
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      const permission = await this.prisma.permission.findUnique({
        where: {
          id: record.permissionId,
        },
        select: {
          code: true,
        },
      });

      if (!organizationMembership || !branch || !permission) {
        return null;
      }

      return mapPermissionOverrideRecordToDomain({
        record,
        organizationMembership,
        branch,
        permissionCode: permission.code,
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async save(override: PermissionOverride): Promise<void> {
    try {
      await this.prisma.userPermissionOverride.create({
        data: {
          id: override.id,
          effect: override.effect,
          createdAt: override.createdAt,
          updatedAt: override.updatedAt,
          organizationMembership: {
            connect: {
              id_organizationId: {
                id: override.organizationMembershipId,
                organizationId: override.organizationId,
              },
            },
          },
          branch: {
            connect: {
              id_organizationId: {
                id: override.branchId,
                organizationId: override.organizationId,
              },
            },
          },
          assignedBy: {
            connect: {
              id: override.assignedById,
            },
          },
          permission: {
            connect: {
              code: override.permissionCode,
            },
          },
        },
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async update(override: PermissionOverride): Promise<void> {
    try {
      await this.prisma.userPermissionOverride.update({
        where: {
          id: override.id,
        },
        data: {
          effect: override.effect,
          updatedAt: override.updatedAt,
        },
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async delete(override: PermissionOverride): Promise<void> {
    try {
      await this.prisma.userPermissionOverride.delete({
        where: {
          id: override.id,
        },
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
