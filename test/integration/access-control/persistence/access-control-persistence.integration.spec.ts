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
  vi,
} from 'vitest';

import { PrismaService } from '../../../../src/prisma/prisma.service.js';

import { PERMISSION_CODE } from '../../../../src/contexts/access-control/domain/permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SOURCE,
} from '../../../../src/contexts/access-control/domain/roles/role.types.js';
import { Role } from '../../../../src/contexts/access-control/domain/roles/role.js';
import { RoleAssignment } from '../../../../src/contexts/access-control/domain/role-assignments/role-assignment.js';
import {
  PERMISSION_OVERRIDE_EFFECT,
  PermissionOverride,
} from '../../../../src/contexts/access-control/domain/permission-overrides/permission-override.js';

import { PrismaAccessControlUnitOfWork } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-access-control.unit-of-work.js';
import { PrismaDefaultAuthorizationSnapshotReader } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-authorization-snapshot.reader.js';
import { PrismaPermissionOverrideRepository } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-permission-override.repository.js';
import { AuthorizationApplicationService } from '../../../../src/contexts/access-control/application/services/authorization-application.service.js';
import { SetPermissionOverrideCommand } from '../../../../src/contexts/access-control/application/commands/set-permission-override/set-permission-override.command.js';
import { SetPermissionOverrideHandler } from '../../../../src/contexts/access-control/application/commands/set-permission-override/set-permission-override.handler.js';
import type { Clock } from '../../../../src/shared/application/ports/clock.port.js';
import { PrismaRoleAssignmentRepository } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-role-assignment.repository.js';
import { PrismaRoleRepository } from '../../../../src/contexts/access-control/infrastructure/persistence/prisma-role.repository.js';
import { AssignRoleCommand } from '../../../../src/contexts/access-control/application/commands/assign-role/assign-role.command.js';
import { AssignRoleHandler } from '../../../../src/contexts/access-control/application/commands/assign-role/assign-role.handler.js';
import { CreateRoleCommand } from '../../../../src/contexts/access-control/application/commands/create-role/create-role.command.js';
import { CreateRoleHandler } from '../../../../src/contexts/access-control/application/commands/create-role/create-role.handler.js';
import { UpdateRoleCommand } from '../../../../src/contexts/access-control/application/commands/update-role/update-role.command.js';
import { UpdateRoleHandler } from '../../../../src/contexts/access-control/application/commands/update-role/update-role.handler.js';
import { RoleAssignmentAlreadyExistsError } from '../../../../src/contexts/access-control/application/errors/role-assignment-already-exists.error.js';
import { RoleCodeAlreadyExistsError } from '../../../../src/contexts/access-control/application/errors/role-code-already-exists.error.js';

// ============================================================
// TEST DATABASE SAFETY
// ============================================================

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

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

    await tx.permission.upsert({
      where: {
        code: PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
      },
      update: {},
      create: {
        code: PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
      },
    });

    for (const code of [
      PERMISSION_CODE.ORGANIZATION_BRANCHES_READ,
      PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
      PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
      PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
    ]) {
      await tx.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      });
    }

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
            organizationMembershipId: current.organizationMembershipId,
          },
          {
            branchMembershipId: current.branchMembershipId,
          },
          {
            role: {
              is: {
                organizationId: current.organizationId,
              },
            },
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

interface SecondaryTenantFixture {
  readonly ownerUserId: string;
  readonly organizationId: string;
  readonly organizationMembershipId: string;
  readonly branchId: string;
}

async function createSecondaryTenant(
  current: IntegrationFixture,
): Promise<SecondaryTenantFixture> {
  const suffix = randomUUID();

  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        email: `access-control-secondary-owner-${suffix}@example.com`,
        displayName: 'Access Control Secondary Tenant Owner',
        status: 'ACTIVE',
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: `Access Control Secondary ${suffix}`,
        slug: `access-control-secondary-${suffix}`,
        ownerUserId: owner.id,
      },
    });

    await tx.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: owner.id,
        status: 'ACTIVE',
      },
    });

    // The primary test user is also a member of this tenant.
    const membership = await tx.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: current.userId,
        status: 'ACTIVE',
      },
    });

    const branch = await tx.branch.create({
      data: {
        id: randomUUID(),
        organizationId: organization.id,
        nameFa: 'شعبه دوم آزمایشی',
        nameEn: 'Access Control Secondary Branch',
        slug: `secondary-branch-${suffix}`,
        addressFa: 'نشانی آزمایشی دوم',
        cityFa: 'تهران',
        countryCode: 'IR',
        timeZoneId: 'Asia/Tehran',
      },
    });

    return {
      ownerUserId: owner.id,
      organizationId: organization.id,
      organizationMembershipId: membership.id,
      branchId: branch.id,
    };
  });
}

async function cleanupSecondaryTenant(
  secondary: SecondaryTenantFixture,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userPermissionOverride.deleteMany({
      where: {
        organizationId: secondary.organizationId,
      },
    });

    await tx.roleAssignment.deleteMany({
      where: {
        role: {
          is: {
            organizationId: secondary.organizationId,
          },
        },
      },
    });

    await tx.role.deleteMany({
      where: {
        organizationId: secondary.organizationId,
      },
    });

    await tx.organizationMembership.deleteMany({
      where: {
        organizationId: secondary.organizationId,
      },
    });

    await tx.branch.deleteMany({
      where: {
        organizationId: secondary.organizationId,
      },
    });

    await tx.organization.deleteMany({
      where: {
        id: secondary.organizationId,
      },
    });

    await tx.user.deleteMany({
      where: {
        id: secondary.ownerUserId,
      },
    });
  });
}

function getDatabaseErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = error as Error & {
    readonly code?: unknown;
    readonly meta?: unknown;
    readonly cause?: unknown;
  };

  return [
    error.name,
    error.message,
    String(details.code ?? ''),
    details.meta === undefined ? '' : JSON.stringify(details.meta),
    details.cause === undefined ? '' : getDatabaseErrorDetails(details.cause),
  ].join('\n');
}

async function expectPostgresError(
  operation: () => Promise<unknown>,
  expected: {
    readonly sqlState: string;
    readonly message?: string;
  },
): Promise<void> {
  let caughtError: unknown;

  try {
    await operation();
  } catch (error: unknown) {
    caughtError = error;
  }

  expect(caughtError, 'Expected the database operation to fail').toBeDefined();

  const details = getDatabaseErrorDetails(caughtError);

  expect(details).toContain(expected.sqlState);

  if (expected.message !== undefined) {
    expect(details).toContain(expected.message);
  }
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
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
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

async function createOrganizationActorRole(
  current: IntegrationFixture,
  permissionCodes: readonly string[],
  codePrefix: string,
): Promise<string> {
  const role = Role.create({
    code: `${codePrefix}_${current.suffix.replaceAll('-', '').toUpperCase()}`,
    name: `${codePrefix} Integration Actor Role`,
    description: 'Grants permissions required by an integration scenario.',
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    organizationId: current.organizationId,
    isAssignable: true,
    permissionCodes,
  });

  await unitOfWork.execute(async (context) => {
    await context.roleRepository.save(role, current.userId);

    const membership =
      await context.roleAssignmentRepository.findActiveOrganizationMembership(
        current.organizationId,
        current.organizationMembershipId,
      );

    if (!membership) {
      throw new Error('Expected an active actor OrganizationMembership.');
    }

    const assignment = RoleAssignment.create({
      role,
      organizationMembership: membership,
      assignedById: current.userId,
      createdAt: CREATED_AT,
    });

    await context.roleAssignmentRepository.save(assignment);
  });

  return role.getId().getValue();
}

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

    const role = createRole(current, ROLE_ASSIGNMENT_SCOPE.ORGANIZATION);

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
    expect(record?.permissions.map((item) => item.permission.code)).toEqual([
      PERMISSION_CODE.ORGANIZATION_READ,
    ]);
  });

  it('rolls back Role creation when the Unit of Work callback fails', async () => {
    const current = fixture!;

    const role = createRole(current, ROLE_ASSIGNMENT_SCOPE.ORGANIZATION);

    const roleId = role.getId().getValue();
    const applicationError = new Error('Intentional integration rollback.');

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

    const branchRole = createRole(current, ROLE_ASSIGNMENT_SCOPE.BRANCH);

    const identifiers = await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(organizationRole, current.userId);

      await context.roleRepository.save(branchRole, current.userId);

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

      await context.roleAssignmentRepository.save(organizationAssignment);

      await context.roleAssignmentRepository.save(branchAssignment);

      const overrideTarget =
        await context.permissionOverrideRepository.findActiveTarget({
          organizationId: current.organizationId,
          organizationMembershipId: current.organizationMembershipId,
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
      const snapshot = await context.authorizationSnapshotReader.loadSnapshot({
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
      expect(delegationSnapshots.activeBranchSnapshots[0]?.branch?.id).toBe(
        current.branchId,
      );

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

      expect(persistedOrganizationAssignment.revoke(REVOKED_AT)).toBe(true);

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

      await context.roleAssignmentRepository.update(persistedBranchAssignment);

      // Change the existing Override instead of inserting a second row.
      const persistedOverride =
        await context.permissionOverrideRepository.findByUniqueKey({
          organizationId: current.organizationId,
          organizationMembershipId: current.organizationMembershipId,
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

      await context.permissionOverrideRepository.update(persistedOverride);

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

    const persistedOverride = await prisma.userPermissionOverride.findUnique({
      where: {
        id: identifiers.overrideId,
      },
    });

    expect(persistedOverride?.effect).toBe(PERMISSION_OVERRIDE_EFFECT.ALLOW);
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
          organizationMembershipId: current.organizationMembershipId,
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

  it('isolates Role and RoleAssignment reads between organizations for the same user', async () => {
    const current = fixture!;
    const secondary = await createSecondaryTenant(current);

    try {
      const role = Role.create({
        code: `IT_SECONDARY_${randomUUID().replaceAll('-', '').toUpperCase()}`,
        name: 'Secondary Tenant Integration Role',
        description: 'Role owned by the secondary integration tenant.',
        definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        organizationId: secondary.organizationId,
        isAssignable: true,
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
      });

      const roleId = role.getId().getValue();
      let assignmentId = '';

      await unitOfWork.execute(async (context) => {
        await context.roleRepository.save(role, current.userId);

        const membership =
          await context.roleAssignmentRepository.findActiveOrganizationMembership(
            secondary.organizationId,
            secondary.organizationMembershipId,
          );

        expect(membership).not.toBeNull();

        if (!membership) {
          throw new Error('Expected the secondary tenant membership.');
        }

        const assignment = RoleAssignment.create({
          role,
          organizationMembership: membership,
          assignedById: current.userId,
          createdAt: CREATED_AT,
        });

        assignmentId = assignment.id;

        await context.roleAssignmentRepository.save(assignment);
      });

      await unitOfWork.execute(async (context) => {
        await expect(
          context.roleRepository.findById(current.organizationId, roleId),
        ).resolves.toBeNull();

        await expect(
          context.roleRepository.findAssignableById(
            current.organizationId,
            roleId,
          ),
        ).resolves.toBeNull();

        await expect(
          context.roleAssignmentRepository.findByIdForRevocation({
            organizationId: current.organizationId,
            assignmentId,
          }),
        ).resolves.toBeNull();
      });

      const primarySnapshot = await defaultSnapshotReader.loadSnapshot({
        userId: current.userId,
        organizationId: current.organizationId,
        branchId: current.branchId,
      });

      expect(primarySnapshot.roles).toHaveLength(0);
      expect(primarySnapshot.roleAssignments).toHaveLength(0);

      // Verify that the records are visible in their owning tenant.
      const secondarySnapshot = await defaultSnapshotReader.loadSnapshot({
        userId: current.userId,
        organizationId: secondary.organizationId,
        branchId: secondary.branchId,
      });

      expect(
        secondarySnapshot.roles.map((item) => item.getId().getValue()),
      ).toEqual([roleId]);

      expect(secondarySnapshot.roleAssignments.map((item) => item.id)).toEqual([
        assignmentId,
      ]);
    } finally {
      await cleanupSecondaryTenant(secondary);
    }
  });

  it('rejects a RoleAssignment whose target scope does not match the Role', async () => {
    const current = fixture!;
    const branchRole = createRole(current, ROLE_ASSIGNMENT_SCOPE.BRANCH);

    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(branchRole, current.userId);
    });

    await expectPostgresError(
      () =>
        prisma.$executeRaw`
          INSERT INTO "RoleAssignment"
            ("id", "roleId", "organizationMembershipId", "assignedById", "createdAt")
          VALUES
            (
              ${randomUUID()},
              ${branchRole.getId().getValue()},
              ${current.organizationMembershipId},
              ${current.userId},
              CURRENT_TIMESTAMP
            )
        `,
      {
        sqlState: '23514',
        message: 'This role cannot be assigned to an organization membership',
      },
    );
  });

  it('rejects assigning an organization-owned Role outside its organization', async () => {
    const current = fixture!;
    const secondary = await createSecondaryTenant(current);

    try {
      const organizationRole = createRole(
        current,
        ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
      );

      await unitOfWork.execute(async (context) => {
        await context.roleRepository.save(organizationRole, current.userId);
      });

      await expectPostgresError(
        () =>
          prisma.$executeRaw`
            INSERT INTO "RoleAssignment"
              ("id", "roleId", "organizationMembershipId", "assignedById", "createdAt")
            VALUES
              (
                ${randomUUID()},
                ${organizationRole.getId().getValue()},
                ${secondary.organizationMembershipId},
                ${current.userId},
                CURRENT_TIMESTAMP
              )
          `,
        {
          sqlState: '23514',
          message:
            'Organization role cannot be assigned outside its organization',
        },
      );
    } finally {
      await cleanupSecondaryTenant(secondary);
    }
  });

  it('prevents changes to Role ownership and assignment scope', async () => {
    const current = fixture!;
    const role = createRole(current, ROLE_ASSIGNMENT_SCOPE.ORGANIZATION);

    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(role, current.userId);
    });

    await expectPostgresError(
      () =>
        prisma.$executeRaw`
          UPDATE "Role"
          SET "assignmentScope" = 'BRANCH'
          WHERE "id" = ${role.getId().getValue()}
        `,
      {
        sqlState: '23514',
        message:
          'Role ownership and assignment scope are immutable; create a new role instead',
      },
    );
  });

  it('rejects a Permission Override whose Branch belongs to another organization', async () => {
    const current = fixture!;
    const secondary = await createSecondaryTenant(current);

    try {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: {
          code: PERMISSION_CODE.BRANCH_STAFF_READ,
        },
        select: {
          id: true,
        },
      });

      await expectPostgresError(
        () =>
          prisma.$executeRaw`
            INSERT INTO "UserPermissionOverride"
              (
                "id",
                "organizationId",
                "organizationMembershipId",
                "branchId",
                "permissionId",
                "assignedById",
                "effect",
                "createdAt",
                "updatedAt"
              )
            VALUES
              (
                ${randomUUID()},
                ${current.organizationId},
                ${current.organizationMembershipId},
                ${secondary.branchId},
                ${permission.id},
                ${current.userId},
                'DENY',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
          `,
        {
          sqlState: '23503',
        },
      );
    } finally {
      await cleanupSecondaryTenant(secondary);
    }
  });

  it('loads isolated snapshots for every active Branch and evaluates cross-Branch delegation', async () => {
    const current = fixture!;
    const secondaryBranch = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          id: randomUUID(),
          organizationId: current.organizationId,
          nameFa: 'شعبه دوم چندشعبه‌ای',
          nameEn: 'Access Control Multi Branch Second Branch',
          slug: `multi-branch-${current.suffix}`,
          addressFa: 'نشانی شعبه دوم',
          cityFa: 'تهران',
          countryCode: 'IR',
          timeZoneId: 'Asia/Tehran',
        },
      });

      const membership = await tx.branchMembership.create({
        data: {
          organizationId: current.organizationId,
          branchId: branch.id,
          organizationMembershipId: current.organizationMembershipId,
          status: 'ACTIVE',
        },
      });

      return {
        id: branch.id,
        membershipId: membership.id,
      };
    });

    const branchRole = createRole(current, ROLE_ASSIGNMENT_SCOPE.BRANCH);
    const roleId = branchRole.getId().getValue();

    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(branchRole, current.userId);

      const firstTarget =
        await context.roleAssignmentRepository.findActiveBranchMembership(
          current.organizationId,
          current.branchId,
          current.branchMembershipId,
        );

      if (!firstTarget) {
        throw new Error('Expected the first active BranchMembership.');
      }

      const firstAssignment = RoleAssignment.create({
        role: branchRole,
        branchMembership: firstTarget,
        assignedById: current.userId,
        createdAt: CREATED_AT,
      });

      await context.roleAssignmentRepository.save(firstAssignment);
    });

    const authorization = new AuthorizationApplicationService(
      defaultSnapshotReader,
    );

    const firstDelegationSnapshots =
      await defaultSnapshotReader.loadDelegationSnapshots({
        userId: current.userId,
        organizationId: current.organizationId,
      });

    expect(firstDelegationSnapshots.organizationSnapshot.branch).toBeNull();
    expect(firstDelegationSnapshots.activeBranchSnapshots).toHaveLength(2);

    const firstBranchSnapshot =
      firstDelegationSnapshots.activeBranchSnapshots.find(
        (snapshot) => snapshot.branch?.id === current.branchId,
      );

    const secondBranchSnapshot =
      firstDelegationSnapshots.activeBranchSnapshots.find(
        (snapshot) => snapshot.branch?.id === secondaryBranch.id,
      );

    expect(firstBranchSnapshot).toBeDefined();
    expect(secondBranchSnapshot).toBeDefined();

    expect(
      firstBranchSnapshot?.roles.map((item) => item.getId().getValue()),
    ).toEqual([roleId]);

    expect(firstBranchSnapshot?.branchMemberships).toHaveLength(1);
    expect(firstBranchSnapshot?.roleAssignments).toHaveLength(1);

    expect(secondBranchSnapshot?.roles).toHaveLength(0);
    expect(secondBranchSnapshot?.branchMemberships).toHaveLength(1);
    expect(secondBranchSnapshot?.roleAssignments).toHaveLength(0);

    // An Organization-assignment Role may delegate a Branch permission only
    // when the permission is effective in every active Branch.
    const beforeSecondAssignment =
      await authorization.getEffectiveDelegationPermissionCodes({
        userId: current.userId,
        organizationId: current.organizationId,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
      });

    expect(beforeSecondAssignment).not.toContain(
      PERMISSION_CODE.BRANCH_STAFF_READ,
    );

    // Add the same Branch Role to the second BranchMembership.
    await unitOfWork.execute(async (context) => {
      const secondTarget =
        await context.roleAssignmentRepository.findActiveBranchMembership(
          current.organizationId,
          secondaryBranch.id,
          secondaryBranch.membershipId,
        );

      if (!secondTarget) {
        throw new Error('Expected the second active BranchMembership.');
      }

      const secondAssignment = RoleAssignment.create({
        role: branchRole,
        branchMembership: secondTarget,
        assignedById: current.userId,
        createdAt: new Date(CREATED_AT.getTime() + 1),
      });

      await context.roleAssignmentRepository.save(secondAssignment);
    });

    const updatedDelegationSnapshots =
      await defaultSnapshotReader.loadDelegationSnapshots({
        userId: current.userId,
        organizationId: current.organizationId,
      });

    expect(updatedDelegationSnapshots.activeBranchSnapshots).toHaveLength(2);

    for (const snapshot of updatedDelegationSnapshots.activeBranchSnapshots) {
      expect(snapshot.branchMemberships).toHaveLength(1);
      expect(snapshot.roleAssignments).toHaveLength(1);
      expect(snapshot.roles.map((item) => item.getId().getValue())).toContain(
        roleId,
      );
    }

    const afterSecondAssignment =
      await authorization.getEffectiveDelegationPermissionCodes({
        userId: current.userId,
        organizationId: current.organizationId,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
      });

    expect(afterSecondAssignment).toContain(PERMISSION_CODE.BRANCH_STAFF_READ);
  });

  it('handles concurrent AssignRole requests for the same membership and Role', async () => {
    const current = fixture!;

    await createOrganizationActorRole(
      current,
      [
        PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
        PERMISSION_CODE.ORGANIZATION_READ,
      ],
      'IT_ASSIGN_MANAGER',
    );

    const targetRole = createRole(current, ROLE_ASSIGNMENT_SCOPE.ORGANIZATION);

    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(targetRole, current.userId);
    });

    const handler = new AssignRoleHandler(
      unitOfWork,
      new AuthorizationApplicationService(defaultSnapshotReader),
      { now: () => CREATED_AT },
    );

    const command = new AssignRoleCommand(current.userId, {
      organizationId: current.organizationId,
      roleId: targetRole.getId().getValue(),
      organizationMembershipId: current.organizationMembershipId,
    });

    let initialMissingReads = 0;
    let releaseInitialReads: () => void = () => {};
    const bothInitialReadsCompleted = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });

    const originalExists =
      PrismaRoleAssignmentRepository.prototype.existsActiveForTarget;

    const existsSpy = vi
      .spyOn(PrismaRoleAssignmentRepository.prototype, 'existsActiveForTarget')
      .mockImplementation(async function (
        this: PrismaRoleAssignmentRepository,
        input,
      ) {
        const exists = await originalExists.call(this, input);

        if (
          input.roleId === targetRole.getId().getValue() &&
          input.organizationMembershipId === current.organizationMembershipId &&
          !exists &&
          initialMissingReads < 2
        ) {
          initialMissingReads += 1;

          if (initialMissingReads === 2) {
            releaseInitialReads();
          }

          await bothInitialReadsCompleted;
        }

        return exists;
      });

    try {
      const results = await Promise.allSettled([
        handler.execute(command),
        handler.execute(command),
      ]);

      expect(initialMissingReads).toBe(2);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);

      const rejected = results.find((result) => result.status === 'rejected');

      if (!rejected || rejected.status !== 'rejected') {
        throw new Error(
          'Expected one concurrent assignment request to conflict.',
        );
      }

      expect(rejected.reason).toBeInstanceOf(RoleAssignmentAlreadyExistsError);

      const assignments = await prisma.roleAssignment.findMany({
        where: {
          roleId: targetRole.getId().getValue(),
          organizationMembershipId: current.organizationMembershipId,
          revokedAt: null,
        },
        select: { id: true },
      });

      expect(assignments).toHaveLength(1);
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('handles concurrent CreateRole requests with the same organization code', async () => {
    const current = fixture!;

    await createOrganizationActorRole(
      current,
      [
        PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
        PERMISSION_CODE.ORGANIZATION_READ,
      ],
      'IT_CREATE_MANAGER',
    );

    const code = `IT_CONCURRENT_ROLE_${current.suffix.replaceAll('-', '').toUpperCase()}`;

    const handler = new CreateRoleHandler(
      unitOfWork,
      new AuthorizationApplicationService(defaultSnapshotReader),
    );

    const command = new CreateRoleCommand(current.userId, {
      organizationId: current.organizationId,
      code,
      name: 'Concurrent Integration Role',
      assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
      permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
    });

    let initialMissingReads = 0;
    let releaseInitialReads: () => void = () => {};
    const bothInitialReadsCompleted = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });

    const originalExists = PrismaRoleRepository.prototype.existsByCode;

    const existsSpy = vi
      .spyOn(PrismaRoleRepository.prototype, 'existsByCode')
      .mockImplementation(async function (
        this: PrismaRoleRepository,
        organizationId,
        roleCode,
      ) {
        const exists = await originalExists.call(
          this,
          organizationId,
          roleCode,
        );

        if (
          organizationId === current.organizationId &&
          roleCode === code &&
          !exists &&
          initialMissingReads < 2
        ) {
          initialMissingReads += 1;

          if (initialMissingReads === 2) {
            releaseInitialReads();
          }

          await bothInitialReadsCompleted;
        }

        return exists;
      });

    try {
      const results = await Promise.allSettled([
        handler.execute(command),
        handler.execute(command),
      ]);

      expect(initialMissingReads).toBe(2);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);

      const rejected = results.find((result) => result.status === 'rejected');

      if (!rejected || rejected.status !== 'rejected') {
        throw new Error(
          'Expected one concurrent Role creation request to conflict.',
        );
      }

      expect(rejected.reason).toBeInstanceOf(RoleCodeAlreadyExistsError);

      const persistedRoles = await prisma.role.findMany({
        where: {
          organizationId: current.organizationId,
          code,
          definitionScope: 'ORGANIZATION',
        },
        select: { id: true },
      });

      expect(persistedRoles).toHaveLength(1);
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('serializes concurrent Role permission-set replacements without partial relations', async () => {
    const current = fixture!;

    await createOrganizationActorRole(
      current,
      [
        PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
        PERMISSION_CODE.ORGANIZATION_READ,
        PERMISSION_CODE.ORGANIZATION_BRANCHES_READ,
      ],
      'IT_UPDATE_MANAGER',
    );

    const role = createRole(current, ROLE_ASSIGNMENT_SCOPE.ORGANIZATION);

    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(role, current.userId);
    });

    const roleId = role.getId().getValue();

    const handler = new UpdateRoleHandler(
      unitOfWork,
      new AuthorizationApplicationService(defaultSnapshotReader),
    );

    const commands = [
      new UpdateRoleCommand(current.userId, {
        organizationId: current.organizationId,
        roleId,
        name: 'Concurrent Role Update A',
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
      }),
      new UpdateRoleCommand(current.userId, {
        organizationId: current.organizationId,
        roleId,
        name: 'Concurrent Role Update B',
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_BRANCHES_READ],
      }),
    ];

    let initialReads = 0;
    let releaseInitialReads: () => void = () => {};
    const bothInitialReadsCompleted = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });

    const originalFindById = PrismaRoleRepository.prototype.findById;

    const findSpy = vi
      .spyOn(PrismaRoleRepository.prototype, 'findById')
      .mockImplementation(async function (
        this: PrismaRoleRepository,
        organizationId,
        requestedRoleId,
      ) {
        const found = await originalFindById.call(
          this,
          organizationId,
          requestedRoleId,
        );

        if (
          organizationId === current.organizationId &&
          requestedRoleId === roleId &&
          found !== null &&
          initialReads < 2
        ) {
          initialReads += 1;

          if (initialReads === 2) {
            releaseInitialReads();
          }

          await bothInitialReadsCompleted;
        }

        return found;
      });

    try {
      const results = await Promise.allSettled(
        commands.map((command) => handler.execute(command)),
      );

      expect(initialReads).toBe(2);
      expect(results.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );

      const persisted = await prisma.role.findUniqueOrThrow({
        where: { id: roleId },
        include: {
          permissions: {
            include: {
              permission: {
                select: { code: true },
              },
            },
          },
        },
      });

      const persistedCodes = persisted.permissions
        .map((item) => item.permission.code)
        .sort();

      const allowedPermissionSets = [
        [PERMISSION_CODE.ORGANIZATION_READ],
        [PERMISSION_CODE.ORGANIZATION_BRANCHES_READ],
      ].map((codes) => [...codes].sort());

      expect(allowedPermissionSets).toContainEqual(persistedCodes);
      expect(persisted.permissions).toHaveLength(1);
      expect([
        'Concurrent Role Update A',
        'Concurrent Role Update B',
      ]).toContain(persisted.name);
    } finally {
      findSpy.mockRestore();
    }
  });

  it('handles concurrent SetPermissionOverrideHandler executions idempotently', async () => {
    const current = fixture!;

    const managementRole = Role.create({
      code: `IT_OVERRIDE_MANAGER_${current.suffix.replaceAll('-', '').toUpperCase()}`,
      name: 'Integration Override Manager',
      description: 'Grants permission override management for this test.',
      definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
      assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
      organizationId: current.organizationId,
      isAssignable: true,
      permissionCodes: [
        PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
      ],
    });

    // Give the real actor the permission required by the Handler's policy.
    await unitOfWork.execute(async (context) => {
      await context.roleRepository.save(managementRole, current.userId);

      const membership =
        await context.roleAssignmentRepository.findActiveOrganizationMembership(
          current.organizationId,
          current.organizationMembershipId,
        );

      if (!membership) {
        throw new Error('Expected an active actor OrganizationMembership.');
      }

      const assignment = RoleAssignment.create({
        role: managementRole,
        organizationMembership: membership,
        assignedById: current.userId,
        createdAt: CREATED_AT,
      });

      await context.roleAssignmentRepository.save(assignment);
    });

    const authorization = new AuthorizationApplicationService(
      defaultSnapshotReader,
    );

    const clock: Clock = {
      now: () => CREATED_AT,
    };

    const handler = new SetPermissionOverrideHandler(
      unitOfWork,
      authorization,
      clock,
    );

    const command = new SetPermissionOverrideCommand(current.userId, {
      organizationId: current.organizationId,
      organizationMembershipId: current.organizationMembershipId,
      branchId: current.branchId,
      permissionCode: PERMISSION_CODE.BRANCH_STAFF_READ,
      effect: PERMISSION_OVERRIDE_EFFECT.DENY,
    });

    // Force both real transactions to complete their initial missing-key
    // read before either Handler is allowed to persist the new Override.
    let initialMissingReads = 0;
    let releaseInitialReads: () => void = () => {};

    const bothInitialReadsCompleted = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });

    const originalFindByUniqueKey =
      PrismaPermissionOverrideRepository.prototype.findByUniqueKey;

    const findByUniqueKeySpy = vi
      .spyOn(PrismaPermissionOverrideRepository.prototype, 'findByUniqueKey')
      .mockImplementation(async function (
        this: PrismaPermissionOverrideRepository,
        input,
      ) {
        const existing = await originalFindByUniqueKey.call(this, input);

        const isTargetKey =
          input.organizationId === current.organizationId &&
          input.organizationMembershipId === current.organizationMembershipId &&
          input.branchId === current.branchId &&
          input.permissionCode === PERMISSION_CODE.BRANCH_STAFF_READ;

        if (isTargetKey && existing === null && initialMissingReads < 2) {
          initialMissingReads += 1;

          if (initialMissingReads === 2) {
            releaseInitialReads();
          }

          await bothInitialReadsCompleted;
        }

        return existing;
      });

    try {
      const results = await Promise.all([
        handler.execute(command),
        handler.execute(command),
      ]);

      expect(initialMissingReads).toBe(2);
      expect(results.map((result) => result.changed).sort()).toEqual([
        false,
        true,
      ]);
      expect(results[0]?.overrideId).toBe(results[1]?.overrideId);

      const persistedOverrides = await prisma.userPermissionOverride.findMany({
        where: {
          organizationId: current.organizationId,
          organizationMembershipId: current.organizationMembershipId,
          branchId: current.branchId,
          permission: {
            is: {
              code: PERMISSION_CODE.BRANCH_STAFF_READ,
            },
          },
        },
        select: {
          id: true,
          effect: true,
        },
      });

      expect(persistedOverrides).toHaveLength(1);
      expect(persistedOverrides[0]?.id).toBe(results[0]?.overrideId);
      expect(persistedOverrides[0]?.effect).toBe(
        PERMISSION_OVERRIDE_EFFECT.DENY,
      );
    } finally {
      findByUniqueKeySpy.mockRestore();
    }
  });

  it('handles concurrent creation of the same Permission Override idempotently', async () => {
    const current = fixture!;

    // Force both independent Serializable transactions to observe the
    // missing key before either transaction attempts the insert.
    let initialReadCount = 0;
    let releaseInitialReads: () => void = () => {};

    const bothInitialReadsCompleted = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });

    const applyOverride = () =>
      unitOfWork.execute(async (context) => {
        const target =
          await context.permissionOverrideRepository.findActiveTarget({
            organizationId: current.organizationId,
            organizationMembershipId: current.organizationMembershipId,
            branchId: current.branchId,
          });

        if (!target) {
          throw new Error('Expected an active Permission Override target.');
        }

        const key = {
          organizationId: current.organizationId,
          organizationMembershipId: current.organizationMembershipId,
          branchId: current.branchId,
          permissionCode: PERMISSION_CODE.BRANCH_STAFF_READ,
        };

        const existing =
          await context.permissionOverrideRepository.findByUniqueKey(key);

        if (existing) {
          if (existing.effect !== PERMISSION_OVERRIDE_EFFECT.DENY) {
            throw new Error('Concurrent Override has an unexpected effect.');
          }

          return {
            overrideId: existing.id,
            changed: false,
          };
        }

        initialReadCount += 1;

        if (initialReadCount === 2) {
          releaseInitialReads();
        }

        await bothInitialReadsCompleted;

        const override = PermissionOverride.create({
          organizationId: current.organizationId,
          organizationMembership: target.organizationMembership,
          branch: target.branch,
          permissionCode: PERMISSION_CODE.BRANCH_STAFF_READ,
          assignedById: current.userId,
          effect: PERMISSION_OVERRIDE_EFFECT.DENY,
          createdAt: new Date(),
        });

        await context.permissionOverrideRepository.save(override);

        return {
          overrideId: override.id,
          changed: true,
        };
      });

    const results = await Promise.all([applyOverride(), applyOverride()]);

    expect(initialReadCount).toBe(2);
    expect(results.map((result) => result.changed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]?.overrideId).toBe(results[1]?.overrideId);

    const persistedOverrides = await prisma.userPermissionOverride.findMany({
      where: {
        organizationId: current.organizationId,
        organizationMembershipId: current.organizationMembershipId,
        branchId: current.branchId,
        permission: {
          is: {
            code: PERMISSION_CODE.BRANCH_STAFF_READ,
          },
        },
      },
      select: {
        id: true,
        effect: true,
      },
    });

    expect(persistedOverrides).toHaveLength(1);
    expect(persistedOverrides[0]?.id).toBe(results[0]?.overrideId);
    expect(persistedOverrides[0]?.effect).toBe(PERMISSION_OVERRIDE_EFFECT.DENY);
  });
});
