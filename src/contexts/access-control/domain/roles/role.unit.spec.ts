import { describe, expect, it } from 'vitest';

import {
  InvalidRoleDataError,
  ROLE_DATA_ERROR_CODE,
} from '../errors/invalid-role-data.error.js';
import { PERMISSION_CODE } from '../permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SCOPE,
  ROLE_STATUS,
} from './role.types.js';
import { Role } from './role.js';

function createOrganizationRole(
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    organizationId: 'organization-1',
    isAssignable: true,
    ...overrides,
  });
}

describe('Role', () => {
  describe('creation and ownership', () => {
    it('creates an Organization-defined role owned by one Organization', () => {
      const role = createOrganizationRole();

      expect(role.getCode()).toBe('SALES_MANAGER');
      expect(role.getOrganizationId()).toBe('organization-1');
      expect(role.getDefinitionScope()).toBe('ORGANIZATION');
      expect(role.getAssignmentScope()).toBe('ORGANIZATION');
      expect(role.getStatus()).toBe(ROLE_STATUS.ACTIVE);
    });

    it('creates a System role without an Organization owner', () => {
      const role = Role.create({
        code: 'BRANCH_MANAGER',
        name: 'Branch Manager',
        definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
        organizationId: null,
        isAssignable: true,
      });

      expect(role.getOrganizationId()).toBeNull();
    });

    it('rejects an Organization-defined role without an Organization ID', () => {
      expect(() =>
        createOrganizationRole({ organizationId: null }),
      ).toThrowError(InvalidRoleDataError);

      try {
        createOrganizationRole({ organizationId: null });
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidRoleDataError);
        expect((error as InvalidRoleDataError).code).toBe(
          ROLE_DATA_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        );
      }
    });

    it('rejects a System role owned by an Organization', () => {
      expect(() =>
        Role.create({
          code: 'BRANCH_MANAGER',
          name: 'Branch Manager',
          definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
          assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
          organizationId: 'organization-1',
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_ORGANIZATION_FORBIDDEN,
        }),
      );
    });

    it('rejects an empty role code or name', () => {
      expect(() => createOrganizationRole({ code: '  ' })).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.CODE_REQUIRED,
        }),
      );

      expect(() => createOrganizationRole({ name: '  ' })).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.NAME_REQUIRED,
        }),
      );
    });
  });

  describe('reserved System Roles', () => {
    it('keeps ORGANIZATION_OWNER non-assignable and Organization-scoped', () => {
      const owner = Role.create({
        code: 'ORGANIZATION_OWNER',
        name: 'Organization Owner',
        definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        organizationId: null,
        isAssignable: false,
      });

      expect(owner.canBeAssignedThroughGenericWorkflow()).toBe(false);
    });

    it('rejects an assignable or incorrectly scoped ORGANIZATION_OWNER', () => {
      expect(() =>
        Role.create({
          code: 'ORGANIZATION_OWNER',
          name: 'Organization Owner',
          definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
          assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
          organizationId: null,
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.OWNER_ROLE_RESERVED,
        }),
      );
    });

    it('requires BRANCH_MANAGER to be an assignable System Branch Role', () => {
      expect(() =>
        Role.create({
          code: 'BRANCH_MANAGER',
          name: 'Branch Manager',
          definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
          assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
          organizationId: null,
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.BRANCH_MANAGER_ROLE_RESERVED,
        }),
      );
    });
  });

  describe('permission compatibility', () => {
    it('allows Organization roles to contain Organization and Branch permissions', () => {
      const role = createOrganizationRole({
        permissionCodes: [
          PERMISSION_CODE.ORGANIZATION_READ,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.ORGANIZATION_READ,
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);
    });

    it('allows Branch roles to contain Branch permissions', () => {
      const role = Role.create({
        code: 'BRANCH_SUPERVISOR',
        name: 'Branch Supervisor',
        definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
        organizationId: 'organization-1',
        isAssignable: true,
        permissionCodes: [PERMISSION_CODE.BRANCH_DASHBOARD_READ],
      });

      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);
    });

    it('rejects Organization-target permissions on Branch roles', () => {
      expect(() =>
        Role.create({
          code: 'BRANCH_SUPERVISOR',
          name: 'Branch Supervisor',
          definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
          assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
          organizationId: 'organization-1',
          isAssignable: true,
          permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.PERMISSION_SCOPE_INCOMPATIBLE,
        }),
      );
    });

    it('rejects permission codes absent from the registry', () => {
      expect(() =>
        createOrganizationRole({
          permissionCodes: ['organization.permission.unknown'],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.PERMISSION_UNKNOWN,
        }),
      );
    });

    it('removes duplicate permission codes', () => {
      const role = createOrganizationRole({
        permissionCodes: [
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);
    });

    it('exposes an immutable permission collection', () => {
      const role = createOrganizationRole({
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
      });

      expect(Object.isFrozen(role.getPermissionCodes())).toBe(true);
    });

    it('replaces permissions only after validating the complete new set', () => {
      const role = createOrganizationRole({
        permissionCodes: [PERMISSION_CODE.BRANCH_DASHBOARD_READ],
      });

      role.replacePermissionCodes([PERMISSION_CODE.ORGANIZATION_READ]);

      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.ORGANIZATION_READ,
      ]);

      expect(() =>
        role.replacePermissionCodes([
          PERMISSION_CODE.ORGANIZATION_READ,
          'unknown.permission',
        ]),
      ).toThrowError(InvalidRoleDataError);

      // A failed replacement must not partially mutate the aggregate.
      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.ORGANIZATION_READ,
      ]);
    });
  });

  describe('lifecycle and generic assignment', () => {
    it('allows active and assignable roles through generic assignment workflows', () => {
      const role = createOrganizationRole();

      expect(role.canBeAssignedThroughGenericWorkflow()).toBe(true);
      expect(role.isEffectiveForAuthorization()).toBe(true);
    });

    it('does not allow non-assignable roles through generic assignment workflows', () => {
      const role = createOrganizationRole({ isAssignable: false });

      expect(role.canBeAssignedThroughGenericWorkflow()).toBe(false);
      expect(role.isEffectiveForAuthorization()).toBe(true);
    });

    it('makes an archived role ineffective and unavailable for new assignments', () => {
      const role = createOrganizationRole();

      role.archive();

      expect(role.getStatus()).toBe(ROLE_STATUS.ARCHIVED);
      expect(role.isEffectiveForAuthorization()).toBe(false);
      expect(role.canBeAssignedThroughGenericWorkflow()).toBe(false);
    });
  });
});
