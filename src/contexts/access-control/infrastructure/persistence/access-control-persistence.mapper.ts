import { Prisma } from '../../../../generated/prisma/client.js';
import { PermissionOverride } from '../../domain/permission-overrides/permission-override.js';
import { RoleAssignment } from '../../domain/role-assignments/role-assignment.js';
import { Role } from '../../domain/roles/role.js';

export const ROLE_WITH_PERMISSIONS = {
  permissions: {
    include: {
      permission: {
        select: {
          code: true,
        },
      },
    },
  },
} satisfies Prisma.RoleInclude;

export type PersistedRoleWithPermissions = Prisma.RoleGetPayload<{
  include: typeof ROLE_WITH_PERMISSIONS;
}>;

export const ROLE_ASSIGNMENT_WITH_RELATIONS = {
  role: {
    include: ROLE_WITH_PERMISSIONS,
  },
  organizationMembership: {
    select: {
      id: true,
      organizationId: true,
    },
  },
  branchMembership: {
    select: {
      id: true,
      organizationId: true,
      branchId: true,
      organizationMembershipId: true,
      status: true,
    },
  },
} satisfies Prisma.RoleAssignmentInclude;

export type PersistedRoleAssignmentWithRelations =
  Prisma.RoleAssignmentGetPayload<{
    include: typeof ROLE_ASSIGNMENT_WITH_RELATIONS;
  }>;

export const PERMISSION_OVERRIDE_WITH_RELATIONS = {
  organizationMembership: {
    select: {
      id: true,
      organizationId: true,
    },
  },
  branch: {
    select: {
      id: true,
      organizationId: true,
    },
  },
  permission: {
    select: {
      code: true,
    },
  },
} satisfies Prisma.UserPermissionOverrideInclude;

export type PersistedPermissionOverrideWithRelations =
  Prisma.UserPermissionOverrideGetPayload<{
    include: typeof PERMISSION_OVERRIDE_WITH_RELATIONS;
  }>;

export function mapRoleToDomain(record: PersistedRoleWithPermissions): Role {
  return Role.create({
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    definitionScope: record.definitionScope,
    assignmentScope: record.assignmentScope,
    organizationId: record.organizationId,
    isAssignable: record.isAssignable,
    status: record.status,
    permissionCodes: record.permissions.map(
      (rolePermission) => rolePermission.permission.code,
    ),
  });
}

export function mapRoleAssignmentToDomain(
  record: PersistedRoleAssignmentWithRelations,
): RoleAssignment {
  return RoleAssignment.reconstitute({
    id: record.id,
    role: mapRoleToDomain(record.role),
    organizationMembership: record.organizationMembership
      ? {
          id: record.organizationMembership.id,
          organizationId: record.organizationMembership.organizationId,
        }
      : null,
    branchMembership: record.branchMembership
      ? {
          id: record.branchMembership.id,
          organizationId: record.branchMembership.organizationId,
        }
      : null,
    assignedById: record.assignedById,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  });
}

export function mapPermissionOverrideToDomain(
  record: PersistedPermissionOverrideWithRelations,
): PermissionOverride {
  return PermissionOverride.reconstitute({
    id: record.id,
    organizationId: record.organizationId,
    organizationMembership: {
      id: record.organizationMembership.id,
      organizationId: record.organizationMembership.organizationId,
    },
    branch: {
      id: record.branch.id,
      organizationId: record.branch.organizationId,
    },
    permissionCode: record.permission.code,
    assignedById: record.assignedById,
    effect: record.effect,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}


// Scalar persistence records used to avoid loading three or more
// sibling relations through one query inside an interactive transaction.

export type PersistedRoleAssignmentRecord = Pick<
  Prisma.RoleAssignmentGetPayload<{}>,
  | 'id'
  | 'roleId'
  | 'organizationMembershipId'
  | 'branchMembershipId'
  | 'assignedById'
  | 'createdAt'
  | 'revokedAt'
>;

export interface PersistedOrganizationMembershipReference {
  readonly id: string;
  readonly organizationId: string;
}

export interface PersistedBranchMembershipReference {
  readonly id: string;
  readonly organizationId: string;
}

export type PersistedPermissionOverrideRecord = Pick<
  Prisma.UserPermissionOverrideGetPayload<{}>,
  | 'id'
  | 'organizationId'
  | 'organizationMembershipId'
  | 'branchId'
  | 'permissionId'
  | 'assignedById'
  | 'effect'
  | 'createdAt'
  | 'updatedAt'
>;

export function mapRoleAssignmentRecordToDomain(input: {
  readonly record: PersistedRoleAssignmentRecord;
  readonly role: Role;
  readonly organizationMembership:
    | PersistedOrganizationMembershipReference
    | null;
  readonly branchMembership: PersistedBranchMembershipReference | null;
}): RoleAssignment {
  return RoleAssignment.reconstitute({
    id: input.record.id,
    role: input.role,
    organizationMembership: input.organizationMembership,
    branchMembership: input.branchMembership,
    assignedById: input.record.assignedById,
    createdAt: input.record.createdAt,
    revokedAt: input.record.revokedAt,
  });
}

export function mapPermissionOverrideRecordToDomain(input: {
  readonly record: PersistedPermissionOverrideRecord;
  readonly organizationMembership: PersistedOrganizationMembershipReference;
  readonly branch: PersistedBranchMembershipReference;
  readonly permissionCode: string;
}): PermissionOverride {
  return PermissionOverride.reconstitute({
    id: input.record.id,
    organizationId: input.record.organizationId,
    organizationMembership: input.organizationMembership,
    branch: input.branch,
    permissionCode: input.permissionCode,
    assignedById: input.record.assignedById,
    effect: input.record.effect,
    createdAt: input.record.createdAt,
    updatedAt: input.record.updatedAt,
  });
}
