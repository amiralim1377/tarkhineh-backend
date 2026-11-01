import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { AuthorizationSnapshotReader as AuthorizationSnapshotReaderPort } from '../../application/ports/authorization-snapshot-reader.port.js';
import type {
  AuthorizationDelegationSnapshots,
  LoadAuthorizationSnapshotInput,
} from '../../application/ports/authorization-snapshot-reader.port.js';
import type { AuthorizationSnapshot } from '../../domain/authorization/permission-evaluator.js';
import {
  mapPermissionOverrideRecordToDomain,
  mapRoleAssignmentRecordToDomain,
  mapRoleToDomain,
  ROLE_WITH_PERMISSIONS,
} from './access-control-persistence.mapper.js';

const EMPTY_SNAPSHOT: AuthorizationSnapshot = {
  organization: null,
  organizationMembership: null,
  branch: null,
  branchMemberships: [],
  roles: [],
  roleAssignments: [],
  permissionOverrides: [],
};

async function loadSnapshot(
  prisma: Prisma.TransactionClient,
  input: LoadAuthorizationSnapshotInput,
): Promise<AuthorizationSnapshot> {
  const branchId = input.branchId?.trim() || undefined;

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      status: true,
    },
  });

  const organizationMembership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
    },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      status: true,
    },
  });

  const branch =
    branchId === undefined
      ? null
      : await prisma.branch.findFirst({
          where: {
            id: branchId,
            organizationId: input.organizationId,
          },
          select: {
            id: true,
            organizationId: true,
            status: true,
          },
        });

  if (!organizationMembership) {
    return {
      ...EMPTY_SNAPSHOT,
      organization,
      branch,
    };
  }

  const assignmentBranches: Prisma.RoleAssignmentWhereInput[] = [
    {
      organizationMembershipId: organizationMembership.id,
    },
  ];

  if (branchId !== undefined) {
    assignmentBranches.push({
      branchMembership: {
        is: {
          organizationId: input.organizationId,
          branchId,
          organizationMembershipId: organizationMembership.id,
        },
      },
    });
  }

  // Load scalar Assignment records first. Relation hydration is deliberately
  // sequential to avoid Prisma's parallel relation interpreter on one pg Client.
  const assignmentRecords = await prisma.roleAssignment.findMany({
    where: {
      revokedAt: null,
      OR: assignmentBranches,
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

  const branchMembershipRecords =
    branchId === undefined
      ? []
      : await prisma.branchMembership.findMany({
          where: {
            organizationId: input.organizationId,
            branchId,
            organizationMembershipId: organizationMembership.id,
          },
          select: {
            id: true,
            organizationMembershipId: true,
            branchId: true,
            organizationId: true,
            status: true,
          },
        });

  const overrideRecords =
    branchId === undefined || branch === null
      ? []
      : await prisma.userPermissionOverride.findMany({
          where: {
            organizationId: input.organizationId,
            organizationMembershipId: organizationMembership.id,
            branchId,
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

  const roleIds = [
    ...new Set(assignmentRecords.map((record) => record.roleId)),
  ];

  const roleRecords =
    roleIds.length === 0
      ? []
      : await prisma.role.findMany({
          where: {
            id: {
              in: roleIds,
            },
          },
          include: ROLE_WITH_PERMISSIONS,
        });

  const rolesById = new Map(
    roleRecords.map((record) => [record.id, mapRoleToDomain(record)]),
  );

  const branchMembershipsById = new Map(
    branchMembershipRecords.map((record) => [record.id, record]),
  );

  const permissionIds = [
    ...new Set(overrideRecords.map((record) => record.permissionId)),
  ];

  const permissionRecords =
    permissionIds.length === 0
      ? []
      : await prisma.permission.findMany({
          where: {
            id: {
              in: permissionIds,
            },
          },
          select: {
            id: true,
            code: true,
          },
        });

  const permissionCodesById = new Map(
    permissionRecords.map((record) => [record.id, record.code]),
  );

  const roleAssignments = assignmentRecords.map((record) => {
    const role = rolesById.get(record.roleId);

    if (!role) {
      throw new Error(
        `Role "${record.roleId}" referenced by an Assignment was not found.`,
      );
    }

    const organizationMembershipReference =
      record.organizationMembershipId === null
        ? null
        : {
            id: record.organizationMembershipId,
            organizationId: organizationMembership.organizationId,
          };

    const branchMembershipReference =
      record.branchMembershipId === null
        ? null
        : (branchMembershipsById.get(record.branchMembershipId) ?? null);

    if (
      record.branchMembershipId !== null &&
      branchMembershipReference === null
    ) {
      throw new Error(
        `BranchMembership "${record.branchMembershipId}" referenced by an Assignment was not found in the requested context.`,
      );
    }

    return mapRoleAssignmentRecordToDomain({
      record,
      role,
      organizationMembership: organizationMembershipReference,
      branchMembership: branchMembershipReference,
    });
  });

  const permissionOverrides = overrideRecords.map((record) => {
    const permissionCode = permissionCodesById.get(record.permissionId);

    if (!permissionCode || !branch) {
      throw new Error(
        `Permission "${record.permissionId}" or Branch "${record.branchId}" referenced by an Override was not found.`,
      );
    }

    return mapPermissionOverrideRecordToDomain({
      record,
      organizationMembership: {
        id: organizationMembership.id,
        organizationId: organizationMembership.organizationId,
      },
      branch: {
        id: branch.id,
        organizationId: branch.organizationId,
      },
      permissionCode,
    });
  });

  return {
    organization,
    organizationMembership,
    branch,
    branchMemberships: branchMembershipRecords,
    roles: [...rolesById.values()],
    roleAssignments,
    permissionOverrides,
  };
}

/**
 * Reader bound to an existing interactive transaction.
 *
 * It never starts, commits or rolls back a transaction. Unit of Work supplies
 * this reader together with all transaction-bound repositories.
 */
export class PrismaAuthorizationSnapshotReader implements AuthorizationSnapshotReaderPort {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  async loadSnapshot(
    input: LoadAuthorizationSnapshotInput,
  ): Promise<AuthorizationSnapshot> {
    try {
      return await loadSnapshot(this.prisma, input);
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async loadDelegationSnapshots(
    input: Omit<LoadAuthorizationSnapshotInput, 'branchId'>,
  ): Promise<AuthorizationDelegationSnapshots> {
    try {
      const activeBranches = await this.prisma.branch.findMany({
        where: {
          organizationId: input.organizationId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      const organizationSnapshot = await loadSnapshot(this.prisma, input);

      const activeBranchSnapshots: AuthorizationSnapshot[] = [];

      for (const branch of activeBranches) {
        activeBranchSnapshots.push(
          await loadSnapshot(this.prisma, {
            ...input,
            branchId: branch.id,
          }),
        );
      }

      return {
        organizationSnapshot,
        activeBranchSnapshots,
      };
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}

/**
 * Default reader for standalone Query handlers.
 *
 * Each public read uses one RepeatableRead transaction so the complete
 * snapshot, including all Branch snapshots, comes from one consistent view.
 */
@Injectable()
export class PrismaDefaultAuthorizationSnapshotReader implements AuthorizationSnapshotReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async loadSnapshot(
    input: LoadAuthorizationSnapshotInput,
  ): Promise<AuthorizationSnapshot> {
    try {
      return await this.prisma.$transaction(
        (tx) => new PrismaAuthorizationSnapshotReader(tx).loadSnapshot(input),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async loadDelegationSnapshots(
    input: Omit<LoadAuthorizationSnapshotInput, 'branchId'>,
  ): Promise<AuthorizationDelegationSnapshots> {
    try {
      return await this.prisma.$transaction(
        (tx) =>
          new PrismaAuthorizationSnapshotReader(tx).loadDelegationSnapshots(
            input,
          ),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
