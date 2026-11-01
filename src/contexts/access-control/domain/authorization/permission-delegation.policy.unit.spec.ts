import { describe, expect, it } from 'vitest';

import {
  DELEGATION_DECISION_REASON,
  PermissionDelegationPolicy,
} from './permission-delegation.policy.js';
import { PERMISSION_CODE } from '../permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SCOPE,
} from '../roles/role.types.js';
import { Role } from '../roles/role.js';
import { PERMISSION_OVERRIDE_EFFECT } from '../permission-overrides/permission-override.js';

const ORGANIZATION_ID = 'organization-1';

const policy = new PermissionDelegationPolicy();

function organizationRole(
  permissionCodes: readonly string[],
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    id: 'organization-role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    organizationId: ORGANIZATION_ID,
    isAssignable: true,
    permissionCodes,
    ...overrides,
  });
}

function branchRole(permissionCodes: readonly string[]): Role {
  return Role.create({
    id: 'branch-role-1',
    code: 'BRANCH_SUPERVISOR',
    name: 'Branch Supervisor',
    definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
    organizationId: ORGANIZATION_ID,
    isAssignable: true,
    permissionCodes,
  });
}

describe('PermissionDelegationPolicy', () => {
  describe('canDelegatePermissions', () => {
    it('allows delegation when every permission is known, delegable, and held', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: [
          PERMISSION_CODE.ORGANIZATION_READ,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_READ,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(decision).toEqual({
        allowed: true,
        reasonCode: DELEGATION_DECISION_REASON.ALLOWED,
      });
    });

    it('allows an empty permission set', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: [],
        actorEffectivePermissionCodes: [],
      });

      expect(decision.allowed).toBe(true);
    });

    it('rejects an unknown permission code', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: ['unknown.permission'],
        actorEffectivePermissionCodes: [],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.PERMISSION_UNKNOWN,
      );
      expect(decision.permissionCode).toBe('unknown.permission');
    });

    it('rejects a non-delegable permission even when the actor holds it', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_UPDATE],
        actorEffectivePermissionCodes: [PERMISSION_CODE.ORGANIZATION_UPDATE],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.PERMISSION_NOT_DELEGABLE,
      );
    });

    it('rejects a delegable permission that the actor does not hold', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
        actorEffectivePermissionCodes: [],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ACTOR_PERMISSION_NOT_HELD,
      );
    });

    it('does not infer delegability from the actor having a permission', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
        ],
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
        ],
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.PERMISSION_NOT_DELEGABLE,
      );
    });

    it('handles duplicate requested permission codes without changing the result', () => {
      const decision = policy.canDelegatePermissions({
        permissionCodes: [
          PERMISSION_CODE.ORGANIZATION_READ,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
        actorEffectivePermissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
      });

      expect(decision.allowed).toBe(true);
    });
  });

  describe('canComposeRole', () => {
    it('allows creation with management authority and all delegated permissions', () => {
      const role = organizationRole([
        PERMISSION_CODE.ORGANIZATION_READ,
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);

      const decision = policy.canComposeRole({
        role,
        organizationId: ORGANIZATION_ID,
        operation: 'CREATE',
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
          PERMISSION_CODE.ORGANIZATION_READ,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(decision.allowed).toBe(true);
    });

    it('requires role-update authority for updates', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const decision = policy.canComposeRole({
        role,
        organizationId: ORGANIZATION_ID,
        operation: 'UPDATE',
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
      expect(decision.permissionCode).toBe(
        PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
      );
    });

    it('requires management authority independently of delegation authority', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const decision = policy.canComposeRole({
        role,
        organizationId: ORGANIZATION_ID,
        operation: 'CREATE',
        actorEffectivePermissionCodes: [PERMISSION_CODE.ORGANIZATION_READ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
    });

    it('rejects a role containing a permission the actor cannot delegate', () => {
      const role = organizationRole([
        PERMISSION_CODE.ORGANIZATION_READ,
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);

      const decision = policy.canComposeRole({
        role,
        organizationId: ORGANIZATION_ID,
        operation: 'CREATE',
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ACTOR_PERMISSION_NOT_HELD,
      );
      expect(decision.permissionCode).toBe(
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      );
    });

    it('rejects composition of System Roles', () => {
      const role = Role.create({
        id: 'system-role',
        code: 'BRANCH_MANAGER',
        name: 'Branch Manager',
        definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
        organizationId: null,
        isAssignable: true,
      });

      const decision = policy.canComposeRole({
        role,
        organizationId: ORGANIZATION_ID,
        operation: 'CREATE',
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ROLE_NOT_ORGANIZATION_DEFINED,
      );
    });

    it('rejects composition of a role owned by another Organization', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ], {
        organizationId: 'organization-2',
      });

      const decision = policy.canComposeRole({
        role,
        organizationId: ORGANIZATION_ID,
        operation: 'UPDATE',
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ROLE_ORGANIZATION_MISMATCH,
      );
    });
  });

  describe('canAssignRole', () => {
    it('requires organization role-assignment authority and delegation of all role permissions', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const decision = policy.canAssignRole({
        role,
        targetOrganizationId: ORGANIZATION_ID,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
      });

      expect(decision.allowed).toBe(true);
    });

    it('requires branch role-assignment authority for Branch roles', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = policy.canAssignRole({
        role,
        targetOrganizationId: ORGANIZATION_ID,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(decision.allowed).toBe(true);
    });

    it('does not accept organization role-assignment authority for a Branch role', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = policy.canAssignRole({
        role,
        targetOrganizationId: ORGANIZATION_ID,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
      expect(decision.permissionCode).toBe(PERMISSION_CODE.BRANCH_ROLES_ASSIGN);
    });

    it('rejects assigning a role when the actor cannot delegate one of its permissions', () => {
      const role = organizationRole([
        PERMISSION_CODE.ORGANIZATION_READ,
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      ]);

      const decision = policy.canAssignRole({
        role,
        targetOrganizationId: ORGANIZATION_ID,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ACTOR_PERMISSION_NOT_HELD,
      );
    });

    it('rejects assigning an Organization role to another tenant', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const decision = policy.canAssignRole({
        role,
        targetOrganizationId: 'organization-2',
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
          PERMISSION_CODE.ORGANIZATION_READ,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ROLE_ORGANIZATION_MISMATCH,
      );
    });

    it('rejects reserved ORGANIZATION_OWNER from generic assignment', () => {
      const role = Role.create({
        id: 'owner-role',
        code: 'ORGANIZATION_OWNER',
        name: 'Organization Owner',
        definitionScope: ROLE_DEFINITION_SCOPE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        organizationId: null,
        isAssignable: false,
      });

      const decision = policy.canAssignRole({
        role,
        targetOrganizationId: ORGANIZATION_ID,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ROLE_NOT_ASSIGNABLE,
      );
    });
  });

  describe('canSetPermissionOverride', () => {
    it('allows ALLOW when override-management authority and delegation are present', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
          PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        ],
      });

      expect(decision.allowed).toBe(true);
    });

    it('requires override-management authority for ALLOW', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
        actorEffectivePermissionCodes: [PERMISSION_CODE.BRANCH_DASHBOARD_READ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
    });

    it('requires delegation authority for ALLOW', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.ACTOR_PERMISSION_NOT_HELD,
      );
    });

    it('allows DENY with override-management authority even when the actor does not hold the target permission', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
        ],
      });

      expect(decision.allowed).toBe(true);
    });

    it('requires override-management authority for DENY', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
        actorEffectivePermissionCodes: [],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
    });

    it('rejects Organization-target permissions for overrides', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: PERMISSION_CODE.ORGANIZATION_READ,
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.OVERRIDE_PERMISSION_SCOPE_INVALID,
      );
    });

    it('rejects unknown permissions for overrides', () => {
      const decision = policy.canSetPermissionOverride({
        permissionCode: 'unknown.permission',
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
        actorEffectivePermissionCodes: [
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
        ],
      });

      expect(decision.reasonCode).toBe(
        DELEGATION_DECISION_REASON.PERMISSION_UNKNOWN,
      );
    });
  });
});
