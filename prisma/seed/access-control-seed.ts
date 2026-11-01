import type { Prisma } from '../../src/generated/prisma/client.js';

import {
  PERMISSION_CODE,
  PERMISSION_DEFINITIONS,
  type PermissionCode,
} from '../../src/contexts/access-control/domain/permissions/permission-catalog.js';

// ============================================================
// SYSTEM ROLE PERMISSION SETS
// ============================================================

/**
 * These are explicit static permission sets.
 *
 * Never derive these sets dynamically from the Permission Registry.
 * Adding a new permission must not silently expand system-role privileges.
 */
export const SYSTEM_ROLE_PERMISSION_SETS = {
  ORGANIZATION_OWNER: [
    PERMISSION_CODE.ORGANIZATION_READ,
    PERMISSION_CODE.ORGANIZATION_UPDATE,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_READ,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_UPDATE,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_SUSPEND,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_UPDATE,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_REMOVE,
    PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
    PERMISSION_CODE.ORGANIZATION_ROLES_READ,
    PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
    PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
    PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
    PERMISSION_CODE.BRANCH_DASHBOARD_READ,
    PERMISSION_CODE.BRANCH_STAFF_READ,
    PERMISSION_CODE.BRANCH_STAFF_INVITE,
    PERMISSION_CODE.BRANCH_STAFF_UPDATE,
    PERMISSION_CODE.BRANCH_STAFF_SUSPEND,
    PERMISSION_CODE.BRANCH_STAFF_REMOVE,
    PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
  ],
  BRANCH_MANAGER: [
    PERMISSION_CODE.BRANCH_DASHBOARD_READ,
    PERMISSION_CODE.BRANCH_STAFF_READ,
    PERMISSION_CODE.BRANCH_STAFF_INVITE,
    PERMISSION_CODE.BRANCH_STAFF_UPDATE,
    PERMISSION_CODE.BRANCH_STAFF_SUSPEND,
    PERMISSION_CODE.BRANCH_STAFF_REMOVE,
    PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
  ],
} as const satisfies Record<
  'ORGANIZATION_OWNER' | 'BRANCH_MANAGER',
  readonly PermissionCode[]
>;

// ============================================================
// SYSTEM ROLE DEFINITIONS
// ============================================================

type SystemRoleCode = keyof typeof SYSTEM_ROLE_PERMISSION_SETS;
type AssignmentScope = 'ORGANIZATION' | 'BRANCH';

interface SystemRoleDefinition {
  readonly code: SystemRoleCode;
  readonly name: string;
  readonly description: string;
  readonly assignmentScope: AssignmentScope;
  readonly isAssignable: boolean;
  readonly permissionCodes: readonly PermissionCode[];
}

const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] = [
  {
    code: 'ORGANIZATION_OWNER',
    name: 'مالک سازمان',
    description: 'مدیریت کامل سازمان ترخینه و تمام شعب آن.',
    assignmentScope: 'ORGANIZATION',
    isAssignable: false,
    permissionCodes: SYSTEM_ROLE_PERMISSION_SETS.ORGANIZATION_OWNER,
  },
  {
    code: 'BRANCH_MANAGER',
    name: 'مدیر شعبه',
    description: 'مدیریت عملیات و کارکنان شعبه در محدوده اختیارات مجاز.',
    assignmentScope: 'BRANCH',
    isAssignable: true,
    permissionCodes: SYSTEM_ROLE_PERMISSION_SETS.BRANCH_MANAGER,
  },
];

// ============================================================
// RESULT
// ============================================================

export interface AccessControlSeedResult {
  readonly permissionCount: number;
  readonly roles: readonly {
    readonly code: SystemRoleCode;
    readonly permissionCount: number;
  }[];
}

// ============================================================
// PRECONDITION VALIDATION
// ============================================================

async function validateSystemRoles(
  tx: Prisma.TransactionClient,
): Promise<Map<SystemRoleCode, Prisma.RoleModel>> {
  const roleCodes = SYSTEM_ROLE_DEFINITIONS.map(
    (definition) => definition.code,
  );

  const existingRoles = await tx.role.findMany({
    where: {
      definitionScope: 'SYSTEM',
      code: { in: roleCodes },
    },
  });

  const rolesByCode = new Map<SystemRoleCode, Prisma.RoleModel>(
    existingRoles.map((role) => [
      role.code as SystemRoleCode,
      role,
    ]),
  );

  // Validate every existing System Role before performing any write.
  for (const definition of SYSTEM_ROLE_DEFINITIONS) {
    const existingRole = rolesByCode.get(definition.code);

    if (!existingRole) {
      continue;
    }

    if (existingRole.status === 'ARCHIVED') {
      throw new Error(
        `System role "${definition.code}" is archived. ` +
          'Manual intervention is required before registry synchronization.',
      );
    }

    if (existingRole.assignmentScope !== definition.assignmentScope) {
      throw new Error(
        `System role "${definition.code}" has an invalid assignment scope. ` +
          `Expected "${definition.assignmentScope}", ` +
          `found "${existingRole.assignmentScope}".`,
      );
    }

    if (existingRole.organizationId !== null) {
      throw new Error(
        `System role "${definition.code}" unexpectedly belongs to an organization.`,
      );
    }
  }

  return rolesByCode;
}

// ============================================================
// PERMISSION SYNCHRONIZATION
// ============================================================

async function synchronizePermissions(
  tx: Prisma.TransactionClient,
): Promise<Map<PermissionCode, string>> {
  const permissionIds = new Map<PermissionCode, string>();

  for (const definition of PERMISSION_DEFINITIONS) {
    const permission = await tx.permission.upsert({
      where: {
        code: definition.code,
      },
      update: {},
      create: {
        code: definition.code,
      },
    });

    permissionIds.set(definition.code, permission.id);
  }

  return permissionIds;
}

// ============================================================
// SYSTEM ROLE SYNCHRONIZATION
// ============================================================

async function synchronizeSystemRole(
  tx: Prisma.TransactionClient,
  definition: SystemRoleDefinition,
  existingRole: Prisma.RoleModel | undefined,
  permissionIds: ReadonlyMap<PermissionCode, string>,
): Promise<void> {
  const role = existingRole
    ? await tx.role.update({
        where: {
          id: existingRole.id,
        },
        data: {
          name: definition.name,
          description: definition.description,
          isAssignable: definition.isAssignable,
        },
      })
    : await tx.role.create({
        data: {
          code: definition.code,
          name: definition.name,
          description: definition.description,
          definitionScope: 'SYSTEM',
          assignmentScope: definition.assignmentScope,
          isAssignable: definition.isAssignable,
        },
      });

  const rolePermissionData = definition.permissionCodes.map(
    (permissionCode) => {
      const permissionId = permissionIds.get(permissionCode);

      if (!permissionId) {
        throw new Error(
          `Permission "${permissionCode}" is missing from the synchronized registry.`,
        );
      }

      return {
        roleId: role.id,
        permissionId,
      };
    },
  );

  // Replace permissions only for this exact System Role.
  // RoleAssignments and PermissionOverrides are not modified.
  await tx.rolePermission.deleteMany({
    where: {
      roleId: role.id,
    },
  });

  await tx.rolePermission.createMany({
    data: rolePermissionData,
  });
}

// ============================================================
// ACCESS CONTROL REGISTRY SYNCHRONIZATION
// ============================================================

/**
 * Synchronizes the Permission Registry and its System Roles.
 *
 * IMPORTANT:
 * The caller MUST execute this function inside one interactive Prisma
 * transaction. This function intentionally does not open a nested transaction.
 *
 * The function never deletes Permission rows and never modifies:
 * - Organization-defined custom roles
 * - RoleAssignments
 * - UserPermissionOverrides
 */
export async function synchronizeAccessControlRegistry(
  tx: Prisma.TransactionClient,
): Promise<AccessControlSeedResult> {
  // All preconditions are checked before the first write.
  const existingRoles = await validateSystemRoles(tx);

  // Upsert all source-controlled Permission codes.
  const permissionIds = await synchronizePermissions(tx);

  // Synchronize only the two known System Roles.
  for (const definition of SYSTEM_ROLE_DEFINITIONS) {
    await synchronizeSystemRole(
      tx,
      definition,
      existingRoles.get(definition.code),
      permissionIds,
    );
  }

  return {
    permissionCount: permissionIds.size,
    roles: SYSTEM_ROLE_DEFINITIONS.map((definition) => ({
      code: definition.code,
      permissionCount: definition.permissionCodes.length,
    })),
  };
}
