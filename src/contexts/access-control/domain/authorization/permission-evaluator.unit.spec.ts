import { describe, expect, it } from 'vitest';

import { AUTHORIZATION_DECISION_REASON } from './authorization-decision.js';
import {
  PermissionEvaluator,
  type AuthorizationSnapshot,
  type EvaluatePermissionInput,
} from './permission-evaluator.js';
import { PERMISSION_CODE } from '../permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SOURCE,
  ROLE_STATUS,
} from '../roles/role.types.js';
import { Role } from '../roles/role.js';
import { RoleAssignment } from '../role-assignments/role-assignment.js';
import {
  PermissionOverride,
  PERMISSION_OVERRIDE_EFFECT,
} from '../permission-overrides/permission-override.js';

const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-1';
const ORGANIZATION_MEMBERSHIP_ID = 'organization-membership-1';
const BRANCH_ID = 'branch-1';
const BRANCH_MEMBERSHIP_ID = 'branch-membership-1';
const NOW = new Date('2026-11-01T10:00:00.000Z');

const evaluator = new PermissionEvaluator();

function organizationRole(
  permissionCodes: readonly string[],
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    id: 'organization-role-1',
    code: 'TEST_ORGANIZATION_ROLE',
    name: 'Test Organization Role',
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    organizationId: ORGANIZATION_ID,
    isAssignable: true,
    permissionCodes,
    ...overrides,
  });
}

function branchRole(
  permissionCodes: readonly string[],
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    id: 'branch-role-1',
    code: 'TEST_BRANCH_ROLE',
    name: 'Test Branch Role',
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
    organizationId: ORGANIZATION_ID,
    isAssignable: true,
    permissionCodes,
    ...overrides,
  });
}

function systemBranchRole(permissionCodes: readonly string[]): Role {
  return Role.create({
    id: 'system-branch-role',
    code: 'BRANCH_MANAGER',
    name: 'Branch Manager',
    definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
    organizationId: null,
    isAssignable: true,
    permissionCodes,
  });
}

function organizationAssignment(role: Role): RoleAssignment {
  return RoleAssignment.create({
    role,
    organizationMembership: {
      id: ORGANIZATION_MEMBERSHIP_ID,
      organizationId: ORGANIZATION_ID,
    },
    createdAt: NOW,
  });
}

function branchAssignment(
  role: Role,
  branchMembershipId = BRANCH_MEMBERSHIP_ID,
): RoleAssignment {
  return RoleAssignment.create({
    role,
    branchMembership: {
      id: branchMembershipId,
      organizationId: ORGANIZATION_ID,
    },
    createdAt: NOW,
  });
}

function override(
  effect: 'ALLOW' | 'DENY',
  permissionCode = PERMISSION_CODE.BRANCH_DASHBOARD_READ,
): PermissionOverride {
  return PermissionOverride.create({
    organizationId: ORGANIZATION_ID,
    organizationMembership: {
      id: ORGANIZATION_MEMBERSHIP_ID,
      organizationId: ORGANIZATION_ID,
    },
    branch: {
      id: BRANCH_ID,
      organizationId: ORGANIZATION_ID,
    },
    permissionCode,
    assignedById: 'actor-1',
    effect,
    createdAt: NOW,
  });
}

function createSnapshot(
  overrides: Partial<AuthorizationSnapshot> = {},
): AuthorizationSnapshot {
  return {
    organization: {
      id: ORGANIZATION_ID,
      status: 'ACTIVE',
    },
    organizationMembership: {
      id: ORGANIZATION_MEMBERSHIP_ID,
      userId: USER_ID,
      organizationId: ORGANIZATION_ID,
      status: 'ACTIVE',
    },
    branch: {
      id: BRANCH_ID,
      organizationId: ORGANIZATION_ID,
      status: 'ACTIVE',
    },
    branchMemberships: [
      {
        id: BRANCH_MEMBERSHIP_ID,
        organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
        branchId: BRANCH_ID,
        organizationId: ORGANIZATION_ID,
        status: 'ACTIVE',
      },
    ],
    roles: [],
    roleAssignments: [],
    permissionOverrides: [],
    ...overrides,
  };
}

function evaluate(
  permissionCode: string,
  overrides: {
    readonly userId?: string;
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly snapshot?: Partial<AuthorizationSnapshot>;
  } = {},
) {
  const input: EvaluatePermissionInput = {
    request: {
      userId: overrides.userId ?? USER_ID,
      organizationId: overrides.organizationId ?? ORGANIZATION_ID,
      permissionCode,
      branchId: overrides.branchId ?? BRANCH_ID,
    },
    snapshot: createSnapshot(overrides.snapshot),
  };

  return evaluator.evaluate(input);
}

describe('PermissionEvaluator', () => {
  describe('request and global context validation', () => {
    it('denies an empty user ID', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        userId: ' ',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.USER_ID_REQUIRED,
      );
    });

    it('denies an empty Organization ID', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        organizationId: ' ',
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('denies an unknown permission code', () => {
      const decision = evaluate('unknown.permission');

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.PERMISSION_UNKNOWN,
      );
      expect(decision.context.targetScope).toBeNull();
    });

    it('denies when the Organization is missing', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: { organization: null },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_NOT_FOUND,
      );
    });

    it('denies when the Organization snapshot belongs to another Organization', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          organization: {
            id: 'organization-2',
            status: 'ACTIVE',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_NOT_FOUND,
      );
    });

    it('denies when the Organization is suspended', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          organization: {
            id: ORGANIZATION_ID,
            status: 'SUSPENDED',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_INACTIVE,
      );
    });

    it('denies when the OrganizationMembership is missing', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: { organizationMembership: null },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_FOUND,
      );
    });

    it('denies when the OrganizationMembership belongs to another user', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          organizationMembership: {
            id: ORGANIZATION_MEMBERSHIP_ID,
            userId: 'another-user',
            organizationId: ORGANIZATION_ID,
            status: 'ACTIVE',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_FOUND,
      );
    });

    it('denies when the OrganizationMembership belongs to another Organization', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          organizationMembership: {
            id: ORGANIZATION_MEMBERSHIP_ID,
            userId: USER_ID,
            organizationId: 'organization-2',
            status: 'ACTIVE',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_FOUND,
      );
    });

    it('denies when the OrganizationMembership is not active', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          organizationMembership: {
            id: ORGANIZATION_MEMBERSHIP_ID,
            userId: USER_ID,
            organizationId: ORGANIZATION_ID,
            status: 'SUSPENDED',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_ACTIVE,
      );
    });
  });

  describe('Organization-target permissions', () => {
    it('allows an Organization permission granted by an Organization Role', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [organizationAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ROLE_GRANT,
      );
      expect(decision.context.targetScope).toBe('ORGANIZATION');
      expect(decision.context.branchId).toBeNull();
    });

    it('does not require a Branch ID for an Organization permission', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const decision = evaluator.evaluate({
        request: {
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          permissionCode: PERMISSION_CODE.ORGANIZATION_READ,
        },
        snapshot: createSnapshot({
          roles: [role],
          roleAssignments: [organizationAssignment(role)],
        }),
      });

      expect(decision.allowed).toBe(true);
    });

    it('does not use Branch role assignments for Organization permissions', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [branchAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.NO_PERMISSION_GRANT,
      );
    });
  });

  describe('Branch-target permissions and inheritance', () => {
    it('requires a Branch ID for a Branch permission', () => {
      const decision = evaluator.evaluate({
        request: {
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        },
        snapshot: createSnapshot(),
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.BRANCH_REQUIRED,
      );
    });

    it('denies when the target Branch is missing', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: { branch: null },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.BRANCH_NOT_FOUND,
      );
    });

    it('denies when the Branch belongs to another Organization', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branch: {
            id: BRANCH_ID,
            organizationId: 'organization-2',
            status: 'ACTIVE',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.BRANCH_ORGANIZATION_MISMATCH,
      );
    });

    it('denies when the Branch is inactive', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branch: {
            id: BRANCH_ID,
            organizationId: ORGANIZATION_ID,
            status: 'INACTIVE',
          },
        },
      });

      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.BRANCH_INACTIVE,
      );
    });

    it('inherits Branch permissions from an Organization-assigned Role', () => {
      const role = organizationRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [organizationAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ROLE_GRANT,
      );
    });

    it('does not require a BranchMembership for inherited Organization permissions', () => {
      const role = organizationRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branchMemberships: [],
          roles: [role],
          roleAssignments: [organizationAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(true);
    });

    it('does not let an inactive BranchMembership revoke inherited Organization permissions', () => {
      const role = organizationRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branchMemberships: [
            {
              id: BRANCH_MEMBERSHIP_ID,
              organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
              branchId: BRANCH_ID,
              organizationId: ORGANIZATION_ID,
              status: 'SUSPENDED',
            },
          ],
          roles: [role],
          roleAssignments: [organizationAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(true);
    });

    it('allows a Branch permission from a matching active BranchMembership Role', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [branchAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(true);
    });

    it('does not apply a Branch Role to a different Branch', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branchMemberships: [
            {
              id: 'different-branch-membership',
              organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
              branchId: 'another-branch',
              organizationId: ORGANIZATION_ID,
              status: 'ACTIVE',
            },
          ],
          roles: [role],
          roleAssignments: [
            branchAssignment(role, 'different-branch-membership'),
          ],
        },
      });

      expect(decision.allowed).toBe(false);
    });

    it('ignores Branch role assignments when their BranchMembership is inactive', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branchMemberships: [
            {
              id: BRANCH_MEMBERSHIP_ID,
              organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
              branchId: BRANCH_ID,
              organizationId: ORGANIZATION_ID,
              status: 'SUSPENDED',
            },
          ],
          roles: [role],
          roleAssignments: [branchAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(false);
    });

    it('allows a System Branch Role to apply across Organizations', () => {
      const role = systemBranchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [branchAssignment(role)],
        },
      });

      expect(decision.allowed).toBe(true);
    });
  });

  describe('overrides and precedence', () => {
    it('allows a valid ALLOW override without a Role grant', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          permissionOverrides: [override('ALLOW')],
        },
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.OVERRIDE_ALLOW,
      );
    });

    it('DENY override wins over an Organization Role grant', () => {
      const role = organizationRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [organizationAssignment(role)],
          permissionOverrides: [override('DENY')],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.OVERRIDE_DENY,
      );
    });

    it('DENY override wins when both ALLOW and DENY overrides are present', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          permissionOverrides: [override('ALLOW'), override('DENY')],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.OVERRIDE_DENY,
      );
    });

    it('DENY override wins over a Branch Role grant', () => {
      const role = branchRole([PERMISSION_CODE.BRANCH_DASHBOARD_READ]);

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [branchAssignment(role)],
          permissionOverrides: [override('DENY')],
        },
      });

      expect(decision.allowed).toBe(false);
    });

    it('does not let ALLOW override bypass an inactive Organization', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          organization: {
            id: ORGANIZATION_ID,
            status: 'SUSPENDED',
          },
          permissionOverrides: [override('ALLOW')],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_INACTIVE,
      );
    });

    it('does not let ALLOW override bypass an inactive OrganizationMembership', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          organizationMembership: {
            id: ORGANIZATION_MEMBERSHIP_ID,
            userId: USER_ID,
            organizationId: ORGANIZATION_ID,
            status: 'SUSPENDED',
          },
          permissionOverrides: [override('ALLOW')],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_ACTIVE,
      );
    });

    it('does not let ALLOW override bypass an inactive Branch', () => {
      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          branch: {
            id: BRANCH_ID,
            organizationId: ORGANIZATION_ID,
            status: 'INACTIVE',
          },
          permissionOverrides: [override('ALLOW')],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.BRANCH_INACTIVE,
      );
    });

    it('ignores overrides for a different Branch', () => {
      const otherBranchOverride = PermissionOverride.create({
        organizationId: ORGANIZATION_ID,
        organizationMembership: {
          id: ORGANIZATION_MEMBERSHIP_ID,
          organizationId: ORGANIZATION_ID,
        },
        branch: {
          id: 'another-branch',
          organizationId: ORGANIZATION_ID,
        },
        permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
        assignedById: 'actor-1',
        effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
        createdAt: NOW,
      });

      const decision = evaluate(PERMISSION_CODE.BRANCH_DASHBOARD_READ, {
        snapshot: {
          permissionOverrides: [otherBranchOverride],
        },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.NO_PERMISSION_GRANT,
      );
    });
  });

  describe('Role lifecycle and tenant isolation', () => {
    it('ignores archived Roles', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ], {
        status: ROLE_STATUS.ARCHIVED,
      });

      const historicalAssignment = RoleAssignment.reconstitute({
        id: 'archived-role-assignment',
        role,
        organizationMembership: {
          id: ORGANIZATION_MEMBERSHIP_ID,
          organizationId: ORGANIZATION_ID,
        },
        branchMembership: null,
        assignedById: null,
        createdAt: NOW,
        revokedAt: null,
      });

      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [historicalAssignment],
        },
      });

      expect(decision.allowed).toBe(false);
    });

    it('ignores revoked RoleAssignments', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ]);

      const assignment = organizationAssignment(role);
      assignment.revoke(new Date(NOW.getTime() + 1000));

      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [assignment],
        },
      });

      expect(decision.allowed).toBe(false);
    });

    it('ignores Organization Roles owned by another tenant', () => {
      const role = organizationRole([PERMISSION_CODE.ORGANIZATION_READ], {
        organizationId: 'organization-2',
      });

      const foreignTenantAssignment = RoleAssignment.reconstitute({
        id: 'foreign-tenant-assignment',
        role,
        organizationMembership: {
          id: 'foreign-organization-membership',
          organizationId: 'organization-2',
        },
        branchMembership: null,
        assignedById: null,
        createdAt: NOW,
        revokedAt: null,
      });

      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ, {
        snapshot: {
          roles: [role],
          roleAssignments: [foreignTenantAssignment],
        },
      });

      expect(decision.allowed).toBe(false);
    });

    it('denies when no valid Role grant or override exists', () => {
      const decision = evaluate(PERMISSION_CODE.ORGANIZATION_READ);

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe(
        AUTHORIZATION_DECISION_REASON.NO_PERMISSION_GRANT,
      );
    });
  });
});
