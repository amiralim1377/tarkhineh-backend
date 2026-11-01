import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { PrismaService } from '../../../../src/prisma/prisma.service.js';

import { PERMISSION_CODE } from '../../../../src/contexts/access-control/domain/permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SCOPE,
} from '../../../../src/contexts/access-control/domain/roles/role.types.js';
import { Role } from '../../../../src/contexts/access-control/domain/roles/role.js';
import { RoleAssignment } from '../../../../src/contexts/access-control/domain/role-assignments/role-assignment.js';
import {
  PERMISSION_OVERRIDE_EFFECT,
  PermissionOverride,
} from '../../../../src/contexts/access-control/domain/permission-overrides/permission-override.js';

import { PrismaAccessControlUnitOfWork } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-access-control.unit-of-work.js';
import { PrismaDefaultAuthorizationSnapshotReader } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-authorization-snapshot.reader.js';

// ============================================================
// TEST DATABASE SAFETY
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
      'Refusing to run Access Control integration tests from an unexpected database URL',
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
const unitOfWork = new PrismaAccessControlUnitOfWork(prisma);
const defaultSnapshotReader = new PrismaDefaultAuthorizationSnapshotReader(
  prisma,
);

// ============================================================
// FIXTURES
// ============================================================

interface IntegrationFixture {
  readonly suffix: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationMembershipId: string;
  readonly branchId: string;
  readonly branchMembershipId: string;
}

let fixture: IntegrationFixture | undefined;

async function createFixture(): Promise<IntegrationFixture> {
  const suffix = randomUUID();
  const email = `access-control-persistence-${suffix}@example.com`;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        displayName: 'Access Control Persistence Integration User',
        status: 'ACTIVE',
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: `Access Control Integration ${suffix}`,
        slug: `access-control-${suffix}`,
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
        nameEn: 'Access Control Integration Branch',
        slug: `branch-${suffix}`,
        addressFa: 'نشانی آزمایشی',
        cityFa: 'تهران',
        countryCode: 'IR',
        timeZoneId: 'Asia/Tehran',
      },
    });

    const branchMembership = await tx.branchMembership.create({
      data: {
        organizationId: organization.id,
        branchId: branch.id,
        organizationMembershipId: membership.id,
        status: 'ACTIVE',
      },
    });

    // Registry Permissions are global shared records.
    // Upsert them but never delete them during fixture cleanup.
    await tx.permission.upsert({
      where: {
        code: PERMISSION_CODE.ORGANIZATION_READ,
      },
      update: {},
      create: {
        code: PERMISSION_CODE.ORGANIZATION_READ,
      },
    });

    await tx.permission.upsert({
      where: {
        code: PERMISSION_CODE.BRANCH_STAFF_READ,
      },
      update: {},
      create: {
        code: PERMISSION_CODE.BRANCH_STAFF_READ,
      },
    });

    return {
      suffix,
      userId: user.id,
      organizationId: organization.id,
      organizationMembershipId: membership.id,
      branchId: branch.id,
      branchMembershipId: branchMembership.id,
    };
  });
}

async function cleanupFixture(
  current: IntegrationFixture | undefined,
): Promise<void> {
  if (!current) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Remove dependent records explicitly before their referenced records.
    await tx.userPermissionOverride.deleteMany({
      where: {
        organizationId: current.organizationId,
      },
    });

    await tx.roleAssignment.deleteMany({
      where: {
        OR: [
          {
            organizationMembershipId:
              current.organizationMembershipId,
          },
          {
            branchMembershipId: current.branchMembershipId,
          },
        ],
      },
    });

    await tx.role.deleteMany({
      where: {
        organizationId: current.organizationId,
      },
    });

    await tx.branchMembership.deleteMany({
      where: {
        organizationId: current.organizationId,
      },
    });

    await tx.organizationMembership.deleteMany({
      where: {
        organizationId: current.organizationId,
      },
    });

    await tx.branch.deleteMany({
      where: {
        organizationId: current.organizationId,
      },
    });

    await tx.organization.deleteMany({
      where: {
        id: current.organizationId,
      },
    });

    await tx.user.deleteMany({
      where: {
        id: current.userId,
      },
    });
  });
}

// ============================================================
// DOMAIN FIXTURE BUILDERS
// ============================================================

function createRole(
  current: IntegrationFixture,
  assignmentScope:
    | typeof ROLE_ASSIGNMENT_SCOPE.ORGANIZATION
    | typeof ROLE_ASSIGNMENT_SCOPE.BRANCH,
): Role {
  const isOrganizationRole =
    assignmentScope === ROLE_ASSIGNMENT_SCOPE.ORGANIZATION;

  return Role.create({
    code: `${isOrganizationRole ? 'IT_ORG' : 'IT_BRANCH'}_${current.suffix.replaceAll('-', '').toUpperCase()}`,
    name: isOrganizationRole
      ? 'Integration Organization Role'
      : 'Integration Branch Role',
    description: 'Created by Access Control persistence integration tests.',
    definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
    assignmentScope,
    organizationId: current.organizationId,
    isAssignable: true,
    permissionCodes: [
      isOrganizationRole
        ? PERMISSION_CODE.ORGANIZATION_READ
        : PERMISSION_CODE.BRANCH_STAFF_READ,
    ],
  });
}

const CREATED_AT = new Date('2025-01-01T00:00:00.000Z');
const REVOKED_AT = new Date('2025-01-03T00:00:00.000Z');
const OVERRIDE_UPDATED_AT = new Date('2025-01-02T00:00:00.000Z');

// ============================================================
// TEST SUITE
// ============================================================

describe('Access Control Persistence Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await cleanupFixture(fixture);
    fixture = undefined;
  });

  it('commits an Organization Role and its complete Permission relation set', async () => {
    const current = fixture!;

    const role = createRole(
      current,
      ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    );

    const roleId = role.getId().getValue();

    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(role, current.userId);

      const persistedRole = await context.roleRepository.findById(
        current.organizationId,
        roleId,
      );

      expect(persistedRole).not.toBeNull();
      expect(persistedRole?.getCode()).toBe(role.getCode());
      expect(persistedRole?.getPermissionCodes()).toEqual([
        PERMISSION_CODE.ORGANIZATION_READ,
      ]);
    });

    const record = await prisma.role.findUnique({
      where: {
        id: roleId,
      },
      include: {
        permissions: {
          include: {
            permission: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    expect(record).not.toBeNull();
    expect(record?.organizationId).toBe(current.organizationId);
    expect(record?.createdById).toBe(current.userId);
    expect(
      record?.permissions.map((item) => item.permission.code),
    ).toEqual([PERMISSION_CODE.ORGANIZATION_READ]);
  });

  it('rolls back Role creation when the Unit of Work callback fails', async () => {
    const current = fixture!;

    const role = createRole(
      current,
      ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    );

    const roleId = role.getId().getValue();
    const applicationError = new Error(
      'Intentional integration rollback.',
    );

    await expect(
      unitOfWork.execute(async (context) => {
        await context.roleRepository.save(role, current.userId);

        throw applicationError;
      }),
    ).rejects.toBe(applicationError);

    const record = await prisma.role.findUnique({
      where: {
        id: roleId,
      },
    });

    expect(record).toBeNull();
  });

  it('persists assignments and overrides, reads them in the same transaction, and updates them', async () => {
    const current = fixture!;

    const organizationRole = createRole(
      current,
      ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    );

    const branchRole = createRole(
      current,
      ROLE_ASSIGNMENT_SCOPE.BRANCH,
    );

    const identifiers = await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(
        organizationRole,
        current.userId,
      );

      await context.roleRepository.save(
        branchRole,
        current.userId,
      );

      const persistedOrganizationRole =
        await context.roleRepository.findAssignableById(
          current.organizationId,
          organizationRole.getId().getValue(),
        );

      const persistedBranchRole =
        await context.roleRepository.findAssignableById(
          current.organizationId,
          branchRole.getId().getValue(),
        );

      expect(persistedOrganizationRole).not.toBeNull();
      expect(persistedBranchRole).not.toBeNull();

      if (!persistedOrganizationRole || !persistedBranchRole) {
        throw new Error('Expected persisted Roles to be assignable.');
      }

      const organizationTarget =
        await context.roleAssignmentRepository.findActiveOrganizationMembership(
          current.organizationId,
          current.organizationMembershipId,
        );

      const branchTarget =
        await context.roleAssignmentRepository.findActiveBranchMembership(
          current.organizationId,
          current.branchId,
          current.branchMembershipId,
        );

      expect(organizationTarget).not.toBeNull();
      expect(branchTarget).not.toBeNull();

      if (!organizationTarget || !branchTarget) {
        throw new Error('Expected active membership targets.');
      }

      const organizationAssignment = RoleAssignment.create({
        role: persistedOrganizationRole,
        organizationMembership: organizationTarget,
        assignedById: current.userId,
        createdAt: CREATED_AT,
      });

      const branchAssignment = RoleAssignment.create({
        role: persistedBranchRole,
        branchMembership: branchTarget,
        assignedById: current.userId,
        createdAt: CREATED_AT,
      });

      await context.roleAssignmentRepository.save(
        organizationAssignment,
      );

      await context.roleAssignmentRepository.save(branchAssignment);

      const overrideTarget =
        await context.permissionOverrideRepository.findActiveTarget({
          organizationId: current.organizationId,
          organizationMembershipId:
            current.organizationMembershipId,
          branchId: current.branchId,
        });

      expect(overrideTarget).not.toBeNull();

      if (!overrideTarget) {
        throw new Error('Expected an active Permission Override target.');
      }

      const override = PermissionOverride.create({
        organizationId: current.organizationId,
        organizationMembership: overrideTarget.organizationMembership,
        branch: overrideTarget.branch,
        permissionCode: PERMISSION_CODE.BRANCH_STAFF_READ,
        assignedById: current.userId,
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
        createdAt: CREATED_AT,
      });

      await context.permissionOverrideRepository.save(override);

      // Read the newly persisted records using the same transaction client.
      const snapshot =
        await context.authorizationSnapshotReader.loadSnapshot({
          userId: current.userId,
          organizationId: current.organizationId,
          branchId: current.branchId,
        });

      expect(snapshot.organizationMembership?.id).toBe(
        current.organizationMembershipId,
      );
      expect(snapshot.branch?.id).toBe(current.branchId);
      expect(snapshot.branchMemberships).toHaveLength(1);
      expect(snapshot.roles.map((item) => item.getCode()).sort()).toEqual(
        [organizationRole.getCode(), branchRole.getCode()].sort(),
      );
      expect(snapshot.roleAssignments).toHaveLength(2);
      expect(snapshot.permissionOverrides).toHaveLength(1);
      expect(snapshot.permissionOverrides?.[0]?.effect).toBe(
        PERMISSION_OVERRIDE_EFFECT.DENY,
      );

      const delegationSnapshots =
        await context.authorizationSnapshotReader.loadDelegationSnapshots({
          userId: current.userId,
          organizationId: current.organizationId,
        });

      expect(delegationSnapshots.activeBranchSnapshots).toHaveLength(1);
      expect(
        delegationSnapshots.activeBranchSnapshots[0]?.branch?.id,
      ).toBe(current.branchId);

      // Revoke the Organization assignment using its Organization context.
      const persistedOrganizationAssignment =
        await context.roleAssignmentRepository.findByIdForRevocation({
          organizationId: current.organizationId,
          assignmentId: organizationAssignment.id,
        });

      expect(persistedOrganizationAssignment).not.toBeNull();

      if (!persistedOrganizationAssignment) {
        throw new Error('Expected Organization assignment to be readable.');
      }

      expect(
        persistedOrganizationAssignment.revoke(REVOKED_AT),
      ).toBe(true);

      await context.roleAssignmentRepository.update(
        persistedOrganizationAssignment,
      );

      // Revoke the Branch assignment using its exact Branch context.
      const persistedBranchAssignment =
        await context.roleAssignmentRepository.findByIdForRevocation({
          organizationId: current.organizationId,
          assignmentId: branchAssignment.id,
          branchId: current.branchId,
        });

      expect(persistedBranchAssignment).not.toBeNull();

      if (!persistedBranchAssignment) {
        throw new Error('Expected Branch assignment to be readable.');
      }

      expect(persistedBranchAssignment.revoke(REVOKED_AT)).toBe(true);

      await context.roleAssignmentRepository.update(
        persistedBranchAssignment,
      );

      // Change the existing Override instead of inserting a second row.
      const persistedOverride =
        await context.permissionOverrideRepository.findByUniqueKey({
          organizationId: current.organizationId,
          organizationMembershipId:
            current.organizationMembershipId,
          branchId: current.branchId,
          permissionCode: PERMISSION_CODE.BRANCH_STAFF_READ,
        });

      expect(persistedOverride).not.toBeNull();

      if (!persistedOverride) {
        throw new Error('Expected Permission Override to be readable.');
      }

      expect(
        persistedOverride.changeEffect(
          PERMISSION_OVERRIDE_EFFECT.ALLOW,
          OVERRIDE_UPDATED_AT,
        ),
      ).toBe(true);

      await context.permissionOverrideRepository.update(
        persistedOverride,
      );

      return {
        organizationAssignmentId: organizationAssignment.id,
        branchAssignmentId: branchAssignment.id,
        overrideId: override.id,
      };
    });

    // Verify committed state through a fresh database read.
    const assignments = await prisma.roleAssignment.findMany({
      where: {
        id: {
          in: [
            identifiers.organizationAssignmentId,
            identifiers.branchAssignmentId,
          ],
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    expect(assignments).toHaveLength(2);
    expect(assignments.every((item) => item.revokedAt !== null)).toBe(true);

    const persistedOverride =
      await prisma.userPermissionOverride.findUnique({
        where: {
          id: identifiers.overrideId,
        },
      });

    expect(persistedOverride?.effect).toBe(
      PERMISSION_OVERRIDE_EFFECT.ALLOW,
    );
    expect(persistedOverride?.updatedAt.toISOString()).toBe(
      OVERRIDE_UPDATED_AT.toISOString(),
    );

    // Standalone reads use their own RepeatableRead transaction.
    const persistedSnapshot = await defaultSnapshotReader.loadSnapshot({
      userId: current.userId,
      organizationId: current.organizationId,
      branchId: current.branchId,
    });

    expect(persistedSnapshot.roleAssignments).toHaveLength(0);
    expect(persistedSnapshot.permissionOverrides).toHaveLength(1);
    expect(persistedSnapshot.permissionOverrides?.[0]?.effect).toBe(
      PERMISSION_OVERRIDE_EFFECT.ALLOW,
    );

    // Verify deletion uses the same tenant-scoped unique key.
    await unitOfWork.execute(async (context) => {
      const override =
        await context.permissionOverrideRepository.findByUniqueKey({
          organizationId: current.organizationId,
          organizationMembershipId:
            current.organizationMembershipId,
          branchId: current.branchId,
          permissionCode: PERMISSION_CODE.BRANCH_STAFF_READ,
        });

      expect(override).not.toBeNull();

      if (!override) {
        throw new Error('Expected Permission Override before deletion.');
      }

      await context.permissionOverrideRepository.delete(override);
    });

    await expect(
      prisma.userPermissionOverride.findUnique({
        where: {
          id: identifiers.overrideId,
        },
      }),
    ).resolves.toBeNull();
  });
});
