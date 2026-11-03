import { Prisma } from '../../../../generated/prisma/client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleCodeAlreadyExistsError } from '../../application/errors/role-code-already-exists.error.js';
import { Role } from '../../domain/roles/role.js';
import type { PersistedRoleWithPermissions } from './access-control-persistence.mapper.js';
import { PrismaRoleRepository } from './prisma-role.repository.js';

function createRole(
  permissionCodes: readonly string[] = ['organization.read'],
): Role {
  return Role.create({
    id: 'role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    description: 'Sales team permissions',
    definitionSource: 'ORGANIZATION_DEFINED',
    assignmentTarget: 'ORGANIZATION',
    organizationId: 'org-1',
    isAssignable: true,
    permissionCodes,
  });
}

function createPersistedRole(
  overrides: Partial<PersistedRoleWithPermissions> = {},
): PersistedRoleWithPermissions {
  return {
    id: 'role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    description: 'Sales team permissions',
    definitionScope: 'ORGANIZATION',
    assignmentTarget: 'ORGANIZATION',
    organizationId: 'org-1',
    isAssignable: true,
    status: 'ACTIVE',
    createdById: 'actor-1',
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    permissions: [
      {
        roleId: 'role-1',
        permissionId: 'permission-1',
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        permission: {
          code: 'organization.read',
        },
      },
    ],
    ...overrides,
  } as PersistedRoleWithPermissions;
}

function createSut() {
  const findFirst = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  const prisma = {
    role: {
      findFirst,
      create,
      update,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    repository: new PrismaRoleRepository(prisma),
    findFirst,
    create,
    update,
  };
}

function createUniqueViolation(target: string[]): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: { target },
  });
}

describe('PrismaRoleRepository', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  describe('existsByCode', () => {
    it('checks only Organization-defined Roles in the supplied Organization', async () => {
      sut.findFirst.mockResolvedValue({ id: 'role-1' });

      await expect(
        sut.repository.existsByCode('org-1', 'SALES_MANAGER'),
      ).resolves.toBe(true);

      expect(sut.findFirst).toHaveBeenCalledWith({
        where: {
          definitionScope: 'ORGANIZATION',
          organizationId: 'org-1',
          code: 'SALES_MANAGER',
        },
        select: {
          id: true,
        },
      });
    });

    it('returns false when no matching Role exists', async () => {
      sut.findFirst.mockResolvedValue(null);

      await expect(
        sut.repository.existsByCode('org-1', 'MISSING_ROLE'),
      ).resolves.toBe(false);
    });
  });

  describe('findAssignableById', () => {
    it('loads an active System or Organization Role and maps it to Domain', async () => {
      sut.findFirst.mockResolvedValue(createPersistedRole());

      const result = await sut.repository.findAssignableById('org-1', 'role-1');

      expect(sut.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'role-1',
            status: 'ACTIVE',
            isAssignable: true,
            OR: [
              {
                definitionScope: 'SYSTEM',
                organizationId: null,
              },
              {
                definitionScope: 'ORGANIZATION',
                organizationId: 'org-1',
              },
            ],
          },
          include: expect.any(Object),
        }),
      );

      expect(result).toBeInstanceOf(Role);
      expect(result?.getId().getValue()).toBe('role-1');
      expect(result?.getOrganizationId()).toBe('org-1');
      expect(result?.getPermissionCodes()).toEqual(['organization.read']);
    });

    it('returns null when no assignable Role is found', async () => {
      sut.findFirst.mockResolvedValue(null);

      await expect(
        sut.repository.findAssignableById('org-1', 'missing-role'),
      ).resolves.toBeNull();
    });
  });

  describe('save', () => {
    it('persists the Role, creator and complete Permission set together', async () => {
      const role = createRole(['organization.read', 'organization.update']);

      sut.create.mockResolvedValue({ id: 'role-1' });

      await sut.repository.save(role, 'actor-1');

      expect(sut.create).toHaveBeenCalledWith({
        data: {
          id: 'role-1',
          code: 'SALES_MANAGER',
          name: 'Sales Manager',
          description: 'Sales team permissions',
          definitionScope: 'ORGANIZATION',
          assignmentTarget: 'ORGANIZATION',
          organizationId: 'org-1',
          isAssignable: true,
          status: 'ACTIVE',
          createdById: 'actor-1',
          permissions: {
            create: [
              {
                permission: {
                  connect: { code: 'organization.read' },
                },
              },
              {
                permission: {
                  connect: { code: 'organization.update' },
                },
              },
            ],
          },
        },
      });
    });

    it('maps an Organization Role code unique violation to the Application error', async () => {
      sut.create.mockRejectedValue(
        createUniqueViolation(['organizationId', 'code']),
      );

      await expect(
        sut.repository.save(createRole(), 'actor-1'),
      ).rejects.toBeInstanceOf(RoleCodeAlreadyExistsError);
    });

    it('does not misclassify an unrelated unique violation', async () => {
      const error = createUniqueViolation(['id']);
      sut.create.mockRejectedValue(error);

      await expect(sut.repository.save(createRole(), 'actor-1')).rejects.toBe(
        error,
      );
    });
  });

  describe('update', () => {
    it('replaces the complete Permission relation set in the same update', async () => {
      const role = createRole(['organization.read', 'organization.update']);

      role.updateDetails('Updated Sales Manager', 'Updated description');

      sut.update.mockResolvedValue({ id: 'role-1' });

      await sut.repository.update(role);

      expect(sut.update).toHaveBeenCalledWith({
        where: {
          id: 'role-1',
        },
        data: {
          name: 'Updated Sales Manager',
          description: 'Updated description',
          status: 'ACTIVE',
          permissions: {
            deleteMany: {},
            create: [
              {
                permission: {
                  connect: { code: 'organization.read' },
                },
              },
              {
                permission: {
                  connect: { code: 'organization.update' },
                },
              },
            ],
          },
        },
      });
    });

    it('persists an empty Permission set by deleting all existing links', async () => {
      const role = createRole();
      role.replacePermissionCodes([]);

      sut.update.mockResolvedValue({ id: 'role-1' });

      await sut.repository.update(role);

      expect(sut.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            permissions: {
              deleteMany: {},
              create: [],
            },
          }),
        }),
      );
    });
  });
});
