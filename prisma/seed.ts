import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

import {
  PERMISSION_CODE,
  PERMISSION_DEFINITIONS,
  type PermissionCode,
} from '../src/contexts/access-control/domain/permissions/permission-catalog.js';

// ============================================================
// DATABASE CONNECTION
// ============================================================

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ============================================================
// SYSTEM ROLE DEFINITIONS
// ============================================================

interface SystemRoleDefinition {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly assignmentScope: 'ORGANIZATION' | 'BRANCH';
  readonly isAssignable: boolean;
  readonly permissionCodes: readonly PermissionCode[];
}

const systemRoles = [
  {
    code: 'ORGANIZATION_OWNER',
    name: 'مالک سازمان',
    description: 'مدیریت کامل سازمان ترخینه و تمام شعب آن.',
    assignmentScope: 'ORGANIZATION',
    isAssignable: false,

    // Organization Owner receives all defined permissions.
    permissionCodes: PERMISSION_DEFINITIONS.map(
      (permission) => permission.code,
    ),
  },
  {
    code: 'BRANCH_MANAGER',
    name: 'مدیر شعبه',
    description: 'مدیریت عملیات و کارکنان شعبه در محدوده اختیارات مجاز.',
    assignmentScope: 'BRANCH',
    isAssignable: true,

    permissionCodes: [
      PERMISSION_CODE.BRANCH_DASHBOARD_READ,

      PERMISSION_CODE.BRANCH_STAFF_READ,
      PERMISSION_CODE.BRANCH_STAFF_INVITE,
      PERMISSION_CODE.BRANCH_STAFF_UPDATE,
      PERMISSION_CODE.BRANCH_STAFF_SUSPEND,
      PERMISSION_CODE.BRANCH_STAFF_REMOVE,

      PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
    ],
  },
] as const satisfies readonly SystemRoleDefinition[];

// ============================================================
// PERMISSION SEEDING
// ============================================================

async function seedPermissions(): Promise<Map<PermissionCode, string>> {
  const permissionIds = new Map<PermissionCode, string>();

  for (const permission of PERMISSION_DEFINITIONS) {
    const savedPermission = await prisma.permission.upsert({
      where: {
        code: permission.code,
      },
      update: {},
      create: {
        code: permission.code,
      },
    });

    permissionIds.set(permission.code, savedPermission.id);
  }

  console.log(`Seeded ${permissionIds.size} permissions.`);

  return permissionIds;
}

// ============================================================
// SYSTEM ROLE SEEDING
// ============================================================

async function seedSystemRole(definition: SystemRoleDefinition) {
  const existingRole = await prisma.role.findFirst({
    where: {
      code: definition.code,
      definitionScope: 'SYSTEM',
    },
  });

  if (existingRole) {
    if (existingRole.assignmentScope !== definition.assignmentScope) {
      throw new Error(
        `System role "${definition.code}" has an unexpected assignment scope.`,
      );
    }

    return prisma.role.update({
      where: {
        id: existingRole.id,
      },
      data: {
        name: definition.name,
        description: definition.description,
        isAssignable: definition.isAssignable,
      },
    });
  }

  return prisma.role.create({
    data: {
      code: definition.code,
      name: definition.name,
      description: definition.description,
      definitionScope: 'SYSTEM',
      assignmentScope: definition.assignmentScope,
      isAssignable: definition.isAssignable,
    },
  });
}

// ============================================================
// ROLE PERMISSION SEEDING
// ============================================================

async function seedRolePermissions(
  roleId: string,
  permissionCodes: readonly PermissionCode[],
  permissionIds: Map<PermissionCode, string>,
): Promise<void> {
  const rolePermissionData = permissionCodes.map((permissionCode) => {
    const permissionId = permissionIds.get(permissionCode);

    if (!permissionId) {
      throw new Error(
        `Permission "${permissionCode}" was not found in the database.`,
      );
    }

    return {
      roleId,
      permissionId,
    };
  });

  // Synchronize the role's permissions with the seed definition.
  await prisma.$transaction(async (transaction) => {
    await transaction.rolePermission.deleteMany({
      where: {
        roleId,
      },
    });

    if (rolePermissionData.length > 0) {
      await transaction.rolePermission.createMany({
        data: rolePermissionData,
      });
    }
  });
}

// ============================================================
// MAIN SEED
// ============================================================

async function main(): Promise<void> {
  console.log('Starting database seeding...');

  // 1. Seed permissions.
  const permissionIds = await seedPermissions();

  // 2. Seed system roles.
  for (const roleDefinition of systemRoles) {
    const role = await seedSystemRole(roleDefinition);

    // 3. Assign permissions to each role.
    await seedRolePermissions(
      role.id,
      roleDefinition.permissionCodes,
      permissionIds,
    );

    console.log(`Seeded role: ${role.code}`);
  }

  console.log('Database seeding completed successfully.');
}

// ============================================================
// EXECUTION
// ============================================================

main()
  .catch((error: unknown) => {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
