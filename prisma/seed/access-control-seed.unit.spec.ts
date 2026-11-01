import { describe, expect, it } from 'vitest';

import { PERMISSION_DEFINITIONS } from '../../src/contexts/access-control/domain/permissions/permission-catalog.js';
import { SYSTEM_ROLE_PERMISSION_SETS } from './access-control-seed.js';

const EXPECTED_OWNER_PERMISSIONS = [
  'organization.read',
  'organization.update',
  'organization.branches.read',
  'organization.branches.create',
  'organization.branches.update',
  'organization.branches.suspend',
  'organization.members.read',
  'organization.members.invite',
  'organization.members.update',
  'organization.members.remove',
  'organization.roles.assign',
  'organization.roles.read',
  'organization.roles.create',
  'organization.roles.update',
  'organization.roles.archive',
  'organization.members.permissions.manage',
  'branch.dashboard.read',
  'branch.staff.read',
  'branch.staff.invite',
  'branch.staff.update',
  'branch.staff.suspend',
  'branch.staff.remove',
  'branch.roles.assign',
] as const;

const EXPECTED_BRANCH_MANAGER_PERMISSIONS = [
  'branch.dashboard.read',
  'branch.staff.read',
  'branch.staff.invite',
  'branch.staff.update',
  'branch.staff.suspend',
  'branch.staff.remove',
  'branch.roles.assign',
] as const;

function expectExactPermissionSet(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(actual).toHaveLength(expected.length);
  expect(new Set(actual).size).toBe(actual.length);
  expect([...actual].sort()).toEqual([...expected].sort());
}

describe('Access Control System Role Permission Sets', () => {
  it('keeps ORGANIZATION_OWNER limited to the exact approved 23 permissions', () => {
    expectExactPermissionSet(
      SYSTEM_ROLE_PERMISSION_SETS.ORGANIZATION_OWNER,
      EXPECTED_OWNER_PERMISSIONS,
    );
  });

  it('keeps BRANCH_MANAGER limited to the exact approved 7 branch permissions', () => {
    expectExactPermissionSet(
      SYSTEM_ROLE_PERMISSION_SETS.BRANCH_MANAGER,
      EXPECTED_BRANCH_MANAGER_PERMISSIONS,
    );
  });

  it('references only permissions registered in the Permission Registry', () => {
    const registryCodes = new Set(
      PERMISSION_DEFINITIONS.map((permission) => permission.code),
    );

    for (const permissionCode of Object.values(
      SYSTEM_ROLE_PERMISSION_SETS,
    ).flat()) {
      expect(registryCodes.has(permissionCode)).toBe(true);
    }
  });

  it('assigns only BRANCH-scoped permissions to BRANCH_MANAGER', () => {
    const definitionsByCode = new Map(
      PERMISSION_DEFINITIONS.map((permission) => [
        permission.code,
        permission,
      ]),
    );

    for (const permissionCode of SYSTEM_ROLE_PERMISSION_SETS.BRANCH_MANAGER) {
      expect(definitionsByCode.get(permissionCode)?.targetScope).toBe(
        'BRANCH',
      );
    }
  });
});
