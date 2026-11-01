import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import type { Prisma } from '../../../../src/generated/prisma/client.js';
import { PrismaService } from '../../../../src/prisma/prisma.service.js';

import {
  PERMISSION_CODE,
  PERMISSION_DEFINITIONS,
} from '../../../../src/contexts/access-control/domain/permissions/permission-catalog.js';

import {
  synchronizeAccessControlRegistry,
  SYSTEM_ROLE_PERMISSION_SETS,
} from '../../../../prisma/seed/access-control-seed.js';

// ============================================================
// TEST DATABASE
// ============================================================

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(
    url.pathname.replace(/^\/+/, ''),
  );

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run access-control integration tests from an unexpected database URL',
    );
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}

const testDatabaseUrl = createTestDatabaseUrl();

const configService = {
  getOrThrow(key: string): string {
    if (key !== 'DATABASE_URL') {
      throw new Error(`Unexpected configuration key: ${key}`);
    }

    return testDatabaseUrl;
  },
} as unknown as ConfigService;

const prisma = new PrismaService(configService);

// ============================================================
// ROLLBACK ISOLATION
// ============================================================

class RollbackTestTransaction extends Error {
  constructor() {
    super('Intentional rollback after integration assertions.');
  }
}

/**
 * Executes the test against a real PostgreSQL transaction.
 *
 * All test fixtures and synchronization writes are rolled back at the end.
 * If an assertion fails, PostgreSQL rolls back the transaction as well.
 */
async function runInRollbackTransaction(
  operation: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await operation(tx);

        throw new RollbackTestTransaction();
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  } catch (error) {
    if (!(error instanceof RollbackTestTransaction)) {
      throw error;
    }
  }
}

// ============================================================
// TEST HELPERS
// ============================================================

function sortCodes(codes: readonly string[]): string[] {
  return [...codes].sort();
}

async function getSystemRolePermissionCodes(
  tx: Prisma.TransactionClient,
  roleCode: 'ORGANIZATION_OWNER' | 'BRANCH_MANAGER',
): Promise<string[]> {
  const role = await tx.role.findFirst({
    where: {
      code: roleCode,
      definitionScope: 'SYSTEM',
    },
    select: {
      id: true,
    },
  });

  if (!role) {
    throw new Error(`Expected System Role "${roleCode}" to exist.`);
  }

  const links = await tx.rolePermission.findMany({
    where: {
      roleId: role.id,
    },
    include: {
      permission: {
        select: {
          code: true,
        },
      },
    },
  });

  return sortCodes(links.map((link) => link.permission.code));
}

// ============================================================
// TEST SUITE
// ============================================================

describe('Access Control Registry Seed Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------
  // REAL SEED, IDEMPOTENCY AND DATA PRESERVATION
  // ----------------------------------------------------------

  it('synchronizes the registry idempotently without changing custom access-control data', async () => {
    const suffix = randomUUID();
    const email = `access-control-seed-${suffix}@example.com`;
    const organizationSlug = `access-control-seed-${suffix}`;
    const branchSlug = `branch-${suffix}`;

    await runInRollbackTransaction(async (tx) => {
      // 1. Create isolated User and Organization fixtures.

      const user = await tx.user.create({
        data: {
          email,
          displayName: 'Access Control Integration User',
          status: 'ACTIVE',
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: 'Access Control Integration Organization',
          slug: organizationSlug,
          ownerUserId: user.id,
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          status: 'ACTIVE',
        },
      });

      const branch = await tx.branch.create({
        data: {
          id: randomUUID(),
          organizationId: organization.id,
          nameFa: 'شعبه آزمایشی',
          nameEn: 'Integration Branch',
          slug: branchSlug,
          addressFa: 'نشانی آزمایشی',
          cityFa: 'تهران',
          countryCode: 'IR',
          timeZoneId: 'Asia/Tehran',
        },
      });

      // 2. Prepare permissions required by the custom role and override.

      const organizationPermission = await tx.permission.upsert({
        where: {
          code: PERMISSION_CODE.ORGANIZATION_READ,
        },
        update: {},
        create: {
          code: PERMISSION_CODE.ORGANIZATION_READ,
        },
      });

      const branchPermission = await tx.permission.upsert({
        where: {
          code: PERMISSION_CODE.BRANCH_STAFF_READ,
        },
        update: {},
        create: {
          code: PERMISSION_CODE.BRANCH_STAFF_READ,
        },
      });

      // This is an unrelated/legacy Permission row.
      // The registry seed must never delete it.

      const legacyPermission = await tx.permission.create({
        data: {
          code: `legacy.permission.${suffix}`,
        },
      });

      // 3. Create an Organization-owned custom Role.

      const customRole = await tx.role.create({
        data: {
          code: `CUSTOM_${suffix}`,
          name: 'Integration Custom Role',
          description: 'Must remain unchanged during System Role seeding.',
          definitionScope: 'ORGANIZATION',
          assignmentScope: 'ORGANIZATION',
          organizationId: organization.id,
          createdById: user.id,
          isAssignable: true,
          status: 'ACTIVE',
        },
      });

      await tx.rolePermission.createMany({
        data: [
          {
            roleId: customRole.id,
            permissionId: organizationPermission.id,
          },
          {
            roleId: customRole.id,
            permissionId: branchPermission.id,
          },
        ],
      });

      // 4. Create an archived custom Role.

      const archivedCustomRole = await tx.role.create({
        data: {
          code: `ARCHIVED_CUSTOM_${suffix}`,
          name: 'Archived Integration Role',
          description: 'Archived custom role preservation test.',
          definitionScope: 'ORGANIZATION',
          assignmentScope: 'BRANCH',
          organizationId: organization.id,
          createdById: user.id,
          isAssignable: true,
          status: 'ARCHIVED',
        },
      });

      await tx.rolePermission.create({
        data: {
          roleId: archivedCustomRole.id,
          permissionId: branchPermission.id,
        },
      });

      // 5. Create a valid RoleAssignment.
      //
      // Exactly one membership target is provided.
      // This satisfies RoleAssignment_exactly_one_membership_check.

      const customRoleAssignment = await tx.roleAssignment.create({
        data: {
          roleId: customRole.id,
          organizationMembershipId: membership.id,
          assignedById: user.id,
        },
      });

      // 6. Create a branch-specific DENY override.

      const permissionOverride = await tx.userPermissionOverride.create({
        data: {
          organizationId: organization.id,
          organizationMembershipId: membership.id,
          branchId: branch.id,
          permissionId: branchPermission.id,
          assignedById: user.id,
          effect: 'DENY',
        },
      });

      // 7. Snapshot all custom access-control data.

      const customRoleBefore = await tx.role.findUniqueOrThrow({
        where: {
          id: customRole.id,
        },
      });

      const customRolePermissionsBefore = await tx.rolePermission.findMany({
        where: {
          roleId: customRole.id,
        },
        orderBy: {
          permissionId: 'asc',
        },
      });

      const archivedRoleBefore = await tx.role.findUniqueOrThrow({
        where: {
          id: archivedCustomRole.id,
        },
      });

      const archivedRolePermissionsBefore =
        await tx.rolePermission.findMany({
          where: {
            roleId: archivedCustomRole.id,
          },
          orderBy: {
            permissionId: 'asc',
          },
        });

      const customAssignmentBefore = await tx.roleAssignment.findUniqueOrThrow({
        where: {
          id: customRoleAssignment.id,
        },
      });

      const overrideBefore = await tx.userPermissionOverride.findUniqueOrThrow({
        where: {
          id: permissionOverride.id,
        },
      });

      // 8. Run the actual production synchronization function.

      const firstResult = await synchronizeAccessControlRegistry(tx);

      expect(firstResult.permissionCount).toBe(23);

      expect(firstResult.roles).toEqual([
        {
          code: 'ORGANIZATION_OWNER',
          permissionCount: 23,
        },
        {
          code: 'BRANCH_MANAGER',
          permissionCount: 7,
        },
      ]);

      // Verify exact System Role permission sets after first execution.

      expect(
        await getSystemRolePermissionCodes(tx, 'ORGANIZATION_OWNER'),
      ).toEqual(
        sortCodes(SYSTEM_ROLE_PERMISSION_SETS.ORGANIZATION_OWNER),
      );

      expect(
        await getSystemRolePermissionCodes(tx, 'BRANCH_MANAGER'),
      ).toEqual(
        sortCodes(SYSTEM_ROLE_PERMISSION_SETS.BRANCH_MANAGER),
      );

      // The custom Role and its permission links must remain unchanged.

      expect(
        await tx.role.findUniqueOrThrow({
          where: { id: customRole.id },
        }),
      ).toEqual(customRoleBefore);

      expect(
        await tx.rolePermission.findMany({
          where: { roleId: customRole.id },
          orderBy: { permissionId: 'asc' },
        }),
      ).toEqual(customRolePermissionsBefore);

      expect(
        await tx.role.findUniqueOrThrow({
          where: { id: archivedCustomRole.id },
        }),
      ).toEqual(archivedRoleBefore);

      expect(
        await tx.rolePermission.findMany({
          where: { roleId: archivedCustomRole.id },
          orderBy: { permissionId: 'asc' },
        }),
      ).toEqual(archivedRolePermissionsBefore);

      expect(
        await tx.roleAssignment.findUniqueOrThrow({
          where: { id: customRoleAssignment.id },
        }),
      ).toEqual(customAssignmentBefore);

      expect(
        await tx.userPermissionOverride.findUniqueOrThrow({
          where: { id: permissionOverride.id },
        }),
      ).toEqual(overrideBefore);

      // 9. Assign OWNER to the test membership after the first sync.
      // The second sync must preserve this assignment too.

      const ownerRole = await tx.role.findFirstOrThrow({
        where: {
          code: 'ORGANIZATION_OWNER',
          definitionScope: 'SYSTEM',
        },
      });

      const ownerAssignment = await tx.roleAssignment.create({
        data: {
          roleId: ownerRole.id,
          organizationMembershipId: membership.id,
          assignedById: user.id,
        },
      });

      // 10. Run the actual synchronization a second time.

      const secondResult = await synchronizeAccessControlRegistry(tx);

      expect(secondResult).toEqual(firstResult);

      expect(
        await getSystemRolePermissionCodes(tx, 'ORGANIZATION_OWNER'),
      ).toEqual(
        sortCodes(SYSTEM_ROLE_PERMISSION_SETS.ORGANIZATION_OWNER),
      );

      expect(
        await getSystemRolePermissionCodes(tx, 'BRANCH_MANAGER'),
      ).toEqual(
        sortCodes(SYSTEM_ROLE_PERMISSION_SETS.BRANCH_MANAGER),
      );

      // The second synchronization must preserve both assignments.

      const assignmentIds = await tx.roleAssignment.findMany({
        where: {
          organizationMembershipId: membership.id,
        },
        select: {
          id: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      expect(sortCodes(assignmentIds.map((item) => item.id))).toEqual(
        sortCodes([
          customRoleAssignment.id,
          ownerAssignment.id,
        ]),
      );

      // The stale Permission row must still exist.

      const preservedLegacyPermission = await tx.permission.findUnique({
        where: {
          id: legacyPermission.id,
        },
      });

      expect(preservedLegacyPermission).not.toBeNull();

      // All 23 current Registry codes must exist.
      // Do not assert that the whole Permission table contains only 23 rows.

      const persistedRegistryPermissions = await tx.permission.findMany({
        where: {
          code: {
            in: PERMISSION_DEFINITIONS.map((permission) => permission.code),
          },
        },
        select: {
          code: true,
        },
      });

      expect(
        sortCodes(persistedRegistryPermissions.map((item) => item.code)),
      ).toEqual(
        sortCodes(PERMISSION_DEFINITIONS.map((permission) => permission.code)),
      );

      // Final confirmation that the custom override is unchanged.

      expect(
        await tx.userPermissionOverride.findUniqueOrThrow({
          where: { id: permissionOverride.id },
        }),
      ).toEqual(overrideBefore);
    });

    // The entire transaction, including fixtures and synchronization,
    // must have been rolled back.

    expect(
      await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
    ).toBeNull();

    expect(
      await prisma.organization.findUnique({
        where: { slug: organizationSlug },
        select: { id: true },
      }),
    ).toBeNull();
  });

  // ----------------------------------------------------------
  // ARCHIVED SYSTEM ROLE — FAIL BEFORE WRITES
  // ----------------------------------------------------------

  it('fails before any synchronization writes when a System Role is archived', async () => {
    await runInRollbackTransaction(async (tx) => {
      // Prepare an archived OWNER System Role inside this transaction.

      const existingOwner = await tx.role.findFirst({
        where: {
          code: 'ORGANIZATION_OWNER',
          definitionScope: 'SYSTEM',
        },
      });

      if (existingOwner) {
        await tx.role.update({
          where: {
            id: existingOwner.id,
          },
          data: {
            status: 'ARCHIVED',
          },
        });
      } else {
        await tx.role.create({
          data: {
            code: 'ORGANIZATION_OWNER',
            name: 'مالک سازمان',
            description: 'Archived test role.',
            definitionScope: 'SYSTEM',
            assignmentScope: 'ORGANIZATION',
            isAssignable: false,
            status: 'ARCHIVED',
          },
        });
      }

      // Snapshot database state after preparing the archived condition
      // but before invoking the synchronization function.

      const permissionsBefore = await tx.permission.findMany({
        select: {
          id: true,
          code: true,
        },
        orderBy: {
          code: 'asc',
        },
      });

      const systemRolesBefore = await tx.role.findMany({
        where: {
          definitionScope: 'SYSTEM',
          code: {
            in: ['ORGANIZATION_OWNER', 'BRANCH_MANAGER'],
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          assignmentScope: true,
          organizationId: true,
          isAssignable: true,
          status: true,
        },
        orderBy: {
          code: 'asc',
        },
      });

      const systemRolePermissionsBefore = await tx.rolePermission.findMany({
        where: {
          role: {
            definitionScope: 'SYSTEM',
          },
        },
        select: {
          roleId: true,
          permissionId: true,
        },
        orderBy: [
          { roleId: 'asc' },
          { permissionId: 'asc' },
        ],
      });

      await expect(
        synchronizeAccessControlRegistry(tx),
      ).rejects.toThrow(/ORGANIZATION_OWNER.*archived/i);

      // No Registry, System Role or RolePermission writes may have occurred.

      expect(
        await tx.permission.findMany({
          select: {
            id: true,
            code: true,
          },
          orderBy: {
            code: 'asc',
          },
        }),
      ).toEqual(permissionsBefore);

      expect(
        await tx.role.findMany({
          where: {
            definitionScope: 'SYSTEM',
            code: {
              in: ['ORGANIZATION_OWNER', 'BRANCH_MANAGER'],
            },
          },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            assignmentScope: true,
            organizationId: true,
            isAssignable: true,
            status: true,
          },
          orderBy: {
            code: 'asc',
          },
        }),
      ).toEqual(systemRolesBefore);

      expect(
        await tx.rolePermission.findMany({
          where: {
            role: {
              definitionScope: 'SYSTEM',
            },
          },
          select: {
            roleId: true,
            permissionId: true,
          },
          orderBy: [
            { roleId: 'asc' },
            { permissionId: 'asc' },
          ],
        }),
      ).toEqual(systemRolePermissionsBefore);
    });
  });
});
