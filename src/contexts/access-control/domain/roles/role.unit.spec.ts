import { describe, expect, it } from 'vitest';

import {
  InvalidRoleDataError,
  ROLE_DATA_ERROR_CODE,
} from '../errors/invalid-role-data.error.js';

import { PERMISSION_CODE } from '../permissions/permission-catalog.js';

import {
  ROLE_ASSIGNMENT_TARGET,
  ROLE_DEFINITION_SOURCE,
  ROLE_STATUS,
} from './role.types.js';

import {
  SYSTEM_ROLE_CODE,
  SYSTEM_ROLE_DEFINITIONS,
} from './system-role-catalog.js';

import { Role } from './role.js';

// ============================================================
// TEST HELPERS
// ============================================================

function createOrganizationRole(
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
    organizationId: 'organization-1',
    isAssignable: true,
    ...overrides,
  });
}

// ============================================================
// ROLE TESTS
// ============================================================

describe('Role', () => {
  // ==========================================================
  // CREATION AND OWNERSHIP
  // ==========================================================

  describe('creation and ownership', () => {
    it('creates an Organization-defined Role owned by one Organization', () => {
      const role = createOrganizationRole();

      expect(role.getCode()).toBe('SALES_MANAGER');
      expect(role.getName()).toBe('Sales Manager');
      expect(role.getDefinitionSource()).toBe(
        ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
      );
      expect(role.getOrganizationId()).toBe('organization-1');
      expect(role.getAssignmentTarget()).toBe(
        ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
      );
      expect(role.getStatus()).toBe(ROLE_STATUS.ACTIVE);
    });

    it.each(SYSTEM_ROLE_DEFINITIONS)(
      'creates System Role $code using its catalog configuration',
      (definition) => {
        const role = Role.create({
          code: definition.code,
          name: definition.code,
          definitionSource: definition.definitionSource,
          assignmentTarget: definition.assignmentTarget,
          organizationId: null,
          isAssignable: definition.isAssignable,
        });

        expect(role.getCode()).toBe(definition.code);
        expect(role.getDefinitionSource()).toBe(ROLE_DEFINITION_SOURCE.SYSTEM);
        expect(role.getAssignmentTarget()).toBe(definition.assignmentTarget);
        expect(role.getOrganizationId()).toBeNull();
        expect(role.isAssignable()).toBe(definition.isAssignable);
      },
    );

    it('rejects an Organization-defined Role without an Organization ID', () => {
      expect(() =>
        createOrganizationRole({ organizationId: null }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        }),
      );
    });

    it('rejects a System Role owned by an Organization', () => {
      expect(() =>
        Role.create({
          code: SYSTEM_ROLE_CODE.BRANCH_MANAGER,
          name: 'Branch Manager',
          definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
          organizationId: 'organization-1',
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_ORGANIZATION_FORBIDDEN,
        }),
      );
    });

    it('rejects an invalid definition source', () => {
      expect(() =>
        Role.create({
          code: 'SALES_MANAGER',
          name: 'Sales Manager',
          definitionSource: 'INVALID_SOURCE' as never,
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
          organizationId: 'organization-1',
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.DEFINITION_SOURCE_INVALID,
        }),
      );
    });

    it('rejects an invalid assignment target', () => {
      expect(() =>
        createOrganizationRole({
          assignmentTarget: 'INVALID_TARGET' as never,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.ASSIGNMENT_SCOPE_INVALID,
        }),
      );
    });

    it('rejects an empty Role code or name', () => {
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

  // ==========================================================
  // SYSTEM ROLE VALIDATION
  // ==========================================================

  describe('System Role validation', () => {
    it('rejects a System Role that is not registered in the catalog', () => {
      expect(() =>
        Role.create({
          code: 'UNKNOWN_SYSTEM_ROLE',
          name: 'Unknown System Role',
          definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
          organizationId: null,
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_NOT_REGISTERED,
        }),
      );
    });

    it('rejects an Organization-defined Role using a reserved System Role code', () => {
      expect(() =>
        Role.create({
          code: SYSTEM_ROLE_CODE.ORGANIZATION_OWNER,
          name: 'Organization Owner',
          definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
          organizationId: 'organization-1',
          isAssignable: false,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_CODE_RESERVED,
        }),
      );
    });

    it('rejects a System Role with an assignment target different from its catalog definition', () => {
      expect(() =>
        Role.create({
          code: SYSTEM_ROLE_CODE.BRANCH_MANAGER,
          name: 'Branch Manager',
          definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
          organizationId: null,
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_CONFIGURATION_INVALID,
        }),
      );
    });

    it('rejects a System Role with an assignability different from its catalog definition', () => {
      expect(() =>
        Role.create({
          code: SYSTEM_ROLE_CODE.ORGANIZATION_OWNER,
          name: 'Organization Owner',
          definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
          organizationId: null,
          isAssignable: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_CONFIGURATION_INVALID,
        }),
      );
    });

    it('does not allow ORGANIZATION_OWNER through generic assignment', () => {
      const owner = Role.create({
        code: SYSTEM_ROLE_CODE.ORGANIZATION_OWNER,
        name: 'Organization Owner',
        definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
        assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
        organizationId: null,
        isAssignable: false,
      });

      expect(owner.isAssignable()).toBe(false);
      expect(owner.canBeAssignedThroughGenericWorkflow()).toBe(false);
    });

    it('allows BRANCH_MANAGER through generic assignment', () => {
      const manager = Role.create({
        code: SYSTEM_ROLE_CODE.BRANCH_MANAGER,
        name: 'Branch Manager',
        definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
        assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
        organizationId: null,
        isAssignable: true,
      });

      expect(manager.isAssignable()).toBe(true);
      expect(manager.canBeAssignedThroughGenericWorkflow()).toBe(true);
    });
  });

  // ==========================================================
  // PERMISSION COMPATIBILITY
  // ==========================================================

  describe('permission compatibility', () => {
    it('allows Organization Roles to contain Organization and Branch permissions', () => {
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

    it('allows Branch Roles to contain Branch permissions', () => {
      const role = createOrganizationRole({
        code: 'BRANCH_SUPERVISOR',
        assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
        permissionCodes: [PERMISSION_CODE.BRANCH_DASHBOARD_READ],
      });

      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);
    });

    it('rejects Organization-level permissions on Branch Roles', () => {
      expect(() =>
        createOrganizationRole({
          code: 'BRANCH_SUPERVISOR',
          assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
          permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.PERMISSION_SCOPE_INCOMPATIBLE,
        }),
      );
    });

    it('rejects permission codes absent from the Permission Catalog', () => {
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
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.PERMISSION_UNKNOWN,
        }),
      );

      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.ORGANIZATION_READ,
      ]);
    });
  });

  // ==========================================================
  // ROLE DETAILS
  // ==========================================================

  describe('mutable details', () => {
    it('updates and normalizes the Role name and description', () => {
      const role = createOrganizationRole({
        name: 'Old Name',
        description: 'Old description',
      });

      role.updateDetails('  Sales Lead  ', '  Leads the sales team  ');

      expect(role.getName()).toBe('Sales Lead');
      expect(role.getDescription()).toBe('Leads the sales team');
    });

    it('allows clearing the description', () => {
      const role = createOrganizationRole({
        description: 'Existing description',
      });

      role.updateDetails('Sales Lead', null);

      expect(role.getName()).toBe('Sales Lead');
      expect(role.getDescription()).toBeNull();
    });

    it('rejects an empty name without mutating current details', () => {
      const role = createOrganizationRole({
        name: 'Existing Name',
        description: 'Existing description',
      });

      expect(() => role.updateDetails('   ', 'Changed')).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.NAME_REQUIRED,
        }),
      );

      expect(role.getName()).toBe('Existing Name');
      expect(role.getDescription()).toBe('Existing description');
    });

    it('does not allow an archived Role to change details or permissions', () => {
      const role = createOrganizationRole({
        name: 'Archived Role',
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
      });

      role.archive();

      expect(() => role.updateDetails('New Name', null)).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.ROLE_ARCHIVED,
        }),
      );

      expect(() =>
        role.replacePermissionCodes([PERMISSION_CODE.BRANCH_DASHBOARD_READ]),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_DATA_ERROR_CODE.ROLE_ARCHIVED,
        }),
      );

      expect(role.getName()).toBe('Archived Role');
      expect(role.getPermissionCodes()).toEqual([
        PERMISSION_CODE.ORGANIZATION_READ,
      ]);
    });
  });

  // ==========================================================
  // LIFECYCLE AND ASSIGNMENT
  // ==========================================================

  describe('lifecycle and generic assignment', () => {
    it('allows active and assignable Organization Roles through generic assignment', () => {
      const role = createOrganizationRole();

      expect(role.canBeAssignedThroughGenericWorkflow()).toBe(true);
      expect(role.isEffectiveForAuthorization()).toBe(true);
    });

    it('does not allow non-assignable Organization Roles through generic assignment', () => {
      const role = createOrganizationRole({
        isAssignable: false,
      });

      expect(role.canBeAssignedThroughGenericWorkflow()).toBe(false);
      expect(role.isEffectiveForAuthorization()).toBe(true);
    });

    it('makes an archived Role ineffective and unavailable for new assignments', () => {
      const role = createOrganizationRole();

      role.archive();

      expect(role.getStatus()).toBe(ROLE_STATUS.ARCHIVED);
      expect(role.isEffectiveForAuthorization()).toBe(false);
      expect(role.canBeAssignedThroughGenericWorkflow()).toBe(false);
    });
  });
});
