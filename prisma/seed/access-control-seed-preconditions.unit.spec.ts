import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';

import { synchronizeAccessControlRegistry } from './access-control-seed.js';

type MockSystemRole = {
  id: string;
  code: 'ORGANIZATION_OWNER' | 'BRANCH_MANAGER';
  status: 'ACTIVE' | 'ARCHIVED';
  assignmentScope: 'ORGANIZATION' | 'BRANCH';
  organizationId: string | null;
};

function createTransactionMock(existingRoles: MockSystemRole[]) {
  const roleFindMany = vi.fn().mockResolvedValue(existingRoles);

  const roleCreate = vi.fn();
  const roleUpdate = vi.fn();
  const permissionUpsert = vi.fn();
  const rolePermissionDeleteMany = vi.fn();
  const rolePermissionCreateMany = vi.fn();

  const tx = {
    role: {
      findMany: roleFindMany,
      create: roleCreate,
      update: roleUpdate,
    },
    permission: {
      upsert: permissionUpsert,
    },
    rolePermission: {
      deleteMany: rolePermissionDeleteMany,
      createMany: rolePermissionCreateMany,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    roleFindMany,
    roleCreate,
    roleUpdate,
    permissionUpsert,
    rolePermissionDeleteMany,
    rolePermissionCreateMany,
  };
}

function expectNoWrites(
  mocks: ReturnType<typeof createTransactionMock>,
): void {
  expect(mocks.permissionUpsert).not.toHaveBeenCalled();
  expect(mocks.roleCreate).not.toHaveBeenCalled();
  expect(mocks.roleUpdate).not.toHaveBeenCalled();
  expect(mocks.rolePermissionDeleteMany).not.toHaveBeenCalled();
  expect(mocks.rolePermissionCreateMany).not.toHaveBeenCalled();
}

describe('Access Control Seed Preconditions', () => {
  it('rejects ORGANIZATION_OWNER with an invalid assignment scope before any write', async () => {
    const mocks = createTransactionMock([
      {
        id: 'system-owner-id',
        code: 'ORGANIZATION_OWNER',
        status: 'ACTIVE',
        assignmentScope: 'BRANCH',
        organizationId: null,
      },
    ]);

    await expect(
      synchronizeAccessControlRegistry(mocks.tx),
    ).rejects.toThrow(
      'System role "ORGANIZATION_OWNER" has an invalid assignment scope.',
    );

    expect(mocks.roleFindMany).toHaveBeenCalledOnce();
    expectNoWrites(mocks);
  });

  it('rejects BRANCH_MANAGER with an invalid assignment scope before any write', async () => {
    const mocks = createTransactionMock([
      {
        id: 'branch-manager-id',
        code: 'BRANCH_MANAGER',
        status: 'ACTIVE',
        assignmentScope: 'ORGANIZATION',
        organizationId: null,
      },
    ]);

    await expect(
      synchronizeAccessControlRegistry(mocks.tx),
    ).rejects.toThrow(
      'System role "BRANCH_MANAGER" has an invalid assignment scope.',
    );

    expect(mocks.roleFindMany).toHaveBeenCalledOnce();
    expectNoWrites(mocks);
  });

  it('rejects a System Role owned by an Organization before any write', async () => {
    const mocks = createTransactionMock([
      {
        id: 'system-owner-id',
        code: 'ORGANIZATION_OWNER',
        status: 'ACTIVE',
        assignmentScope: 'ORGANIZATION',
        organizationId: 'unexpected-organization-id',
      },
    ]);

    await expect(
      synchronizeAccessControlRegistry(mocks.tx),
    ).rejects.toThrow(
      'System role "ORGANIZATION_OWNER" unexpectedly belongs to an organization.',
    );

    expect(mocks.roleFindMany).toHaveBeenCalledOnce();
    expectNoWrites(mocks);
  });
});
