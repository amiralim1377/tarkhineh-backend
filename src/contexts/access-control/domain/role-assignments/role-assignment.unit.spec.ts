import { describe, expect, it } from 'vitest';

import {
  InvalidRoleAssignmentError,
  ROLE_ASSIGNMENT_ERROR_CODE,
} from '../errors/invalid-role-assignment.error.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SOURCE,
  ROLE_STATUS,
} from '../roles/role.types.js';
import { Role } from '../roles/role.js';
import { RoleAssignment, type RoleAssignmentProps } from './role-assignment.js';

const CREATED_AT = new Date('2026-10-30T10:00:00.000Z');
const REVOKED_AT = new Date('2026-10-30T11:00:00.000Z');

function createOrganizationRole(
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    id: 'role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
    organizationId: 'organization-1',
    isAssignable: true,
    ...overrides,
  });
}

function createBranchRole(
  overrides: Partial<Parameters<typeof Role.create>[0]> = {},
): Role {
  return Role.create({
    id: 'role-branch-1',
    code: 'BRANCH_SUPERVISOR',
    name: 'Branch Supervisor',
    definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
    organizationId: 'organization-1',
    isAssignable: true,
    ...overrides,
  });
}

function createOrganizationAssignment(
  overrides: Partial<Parameters<typeof RoleAssignment.create>[0]> = {},
): RoleAssignment {
  return RoleAssignment.create({
    id: 'assignment-1',
    role: createOrganizationRole(),
    organizationMembership: {
      id: 'organization-membership-1',
      organizationId: 'organization-1',
    },
    assignedById: 'actor-1',
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function createPersistedAssignment(
  overrides: Partial<RoleAssignmentProps> = {},
): RoleAssignmentProps {
  return {
    id: 'assignment-1',
    role: createOrganizationRole(),
    organizationMembership: {
      id: 'organization-membership-1',
      organizationId: 'organization-1',
    },
    branchMembership: null,
    assignedById: 'actor-1',
    createdAt: CREATED_AT,
    revokedAt: null,
    ...overrides,
  };
}

describe('RoleAssignment', () => {
  describe('creation', () => {
    it('assigns an Organization role to an OrganizationMembership', () => {
      const assignment = createOrganizationAssignment();

      expect(assignment.id).toBe('assignment-1');
      expect(assignment.roleId).toBe('role-1');
      expect(assignment.organizationMembershipId).toBe(
        'organization-membership-1',
      );
      expect(assignment.branchMembershipId).toBeNull();
      expect(assignment.organizationId).toBe('organization-1');
      expect(assignment.assignedById).toBe('actor-1');
      expect(assignment.createdAt).toEqual(CREATED_AT);
      expect(assignment.isRevoked()).toBe(false);
    });

    it('allows a System role to be assigned across Organizations', () => {
      const role = Role.create({
        id: 'system-branch-manager',
        code: 'BRANCH_MANAGER',
        name: 'Branch Manager',
        definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.BRANCH,
        organizationId: null,
        isAssignable: true,
      });

      const assignment = RoleAssignment.create({
        role,
        branchMembership: {
          id: 'branch-membership-1',
          organizationId: 'another-organization',
        },
        createdAt: CREATED_AT,
      });

      expect(assignment.organizationId).toBe('another-organization');
      expect(assignment.branchMembershipId).toBe('branch-membership-1');
    });

    it('assigns an Organization-defined Branch role to a BranchMembership in the same Organization', () => {
      const assignment = RoleAssignment.create({
        role: createBranchRole(),
        branchMembership: {
          id: 'branch-membership-1',
          organizationId: 'organization-1',
        },
        createdAt: CREATED_AT,
      });

      expect(assignment.branchMembershipId).toBe('branch-membership-1');
      expect(assignment.organizationMembershipId).toBeNull();
    });

    it('rejects an Organization-defined role assigned outside its Organization', () => {
      expect(() =>
        createOrganizationAssignment({
          organizationMembership: {
            id: 'organization-membership-2',
            organizationId: 'organization-2',
          },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ORGANIZATION_MISMATCH,
        }),
      );
    });

    it('rejects an Organization role assigned to a BranchMembership', () => {
      expect(() =>
        RoleAssignment.create({
          role: createOrganizationRole(),
          branchMembership: {
            id: 'branch-membership-1',
            organizationId: 'organization-1',
          },
          createdAt: CREATED_AT,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNMENT_SCOPE_MISMATCH,
        }),
      );
    });

    it('rejects a Branch role assigned to an OrganizationMembership', () => {
      expect(() =>
        RoleAssignment.create({
          role: createBranchRole(),
          organizationMembership: {
            id: 'organization-membership-1',
            organizationId: 'organization-1',
          },
          createdAt: CREATED_AT,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNMENT_SCOPE_MISMATCH,
        }),
      );
    });

    it('requires exactly one membership target', () => {
      expect(() =>
        RoleAssignment.create({
          role: createOrganizationRole(),
          createdAt: CREATED_AT,
        }),
      ).toThrowError(InvalidRoleAssignmentError);

      expect(() =>
        RoleAssignment.create({
          role: createOrganizationRole(),
          organizationMembership: {
            id: 'organization-membership-1',
            organizationId: 'organization-1',
          },
          branchMembership: {
            id: 'branch-membership-1',
            organizationId: 'organization-1',
          },
          createdAt: CREATED_AT,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.MEMBERSHIP_TARGET_INVALID,
        }),
      );
    });

    it('rejects empty membership and actor IDs', () => {
      expect(() =>
        createOrganizationAssignment({
          organizationMembership: {
            id: ' ',
            organizationId: 'organization-1',
          },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.TARGET_ID_REQUIRED,
        }),
      );

      expect(() =>
        createOrganizationAssignment({ assignedById: ' ' }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNED_BY_ID_INVALID,
        }),
      );
    });

    it('rejects archived roles for new assignments', () => {
      const archivedRole = createOrganizationRole({
        status: ROLE_STATUS.ARCHIVED,
      });

      expect(() =>
        createOrganizationAssignment({ role: archivedRole }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ROLE_NOT_ASSIGNABLE,
        }),
      );
    });

    it('rejects non-assignable roles through generic assignment', () => {
      const nonAssignableRole = createOrganizationRole({
        isAssignable: false,
      });

      expect(() =>
        createOrganizationAssignment({ role: nonAssignableRole }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ROLE_NOT_ASSIGNABLE,
        }),
      );
    });

    it('rejects ORGANIZATION_OWNER through generic assignment', () => {
      const owner = Role.create({
        id: 'owner-role',
        code: 'ORGANIZATION_OWNER',
        name: 'Organization Owner',
        definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        organizationId: null,
        isAssignable: false,
      });

      expect(() => createOrganizationAssignment({ role: owner })).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.ROLE_NOT_ASSIGNABLE,
        }),
      );
    });

    it('allows owner assignment only through the dedicated factory', () => {
      const owner = Role.create({
        id: 'owner-role',
        code: 'ORGANIZATION_OWNER',
        name: 'Organization Owner',
        definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        organizationId: null,
        isAssignable: false,
      });

      const assignment = RoleAssignment.createForOrganizationOwner({
        role: owner,
        organizationMembership: {
          id: 'owner-membership',
          organizationId: 'organization-1',
        },
        createdAt: CREATED_AT,
      });

      expect(assignment.organizationMembershipId).toBe('owner-membership');
    });

    it('rejects a non-owner Role in the dedicated owner factory', () => {
      expect(() =>
        RoleAssignment.createForOrganizationOwner({
          role: createOrganizationRole(),
          organizationMembership: {
            id: 'organization-membership-1',
            organizationId: 'organization-1',
          },
          createdAt: CREATED_AT,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.OWNER_ROLE_FACTORY_REQUIRED,
        }),
      );
    });

    it('rejects an owner assignment targeting a BranchMembership', () => {
      const owner = Role.create({
        id: 'owner-role',
        code: 'ORGANIZATION_OWNER',
        name: 'Organization Owner',
        definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
        assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        organizationId: null,
        isAssignable: false,
      });

      expect(() =>
        RoleAssignment.createForOrganizationOwner({
          role: owner,
          branchMembership: {
            id: 'branch-membership-1',
            organizationId: 'organization-1',
          },
          createdAt: CREATED_AT,
        }),
      ).toThrowError(InvalidRoleAssignmentError);
    });
  });

  describe('reconstitution', () => {
    it('reconstitutes a persisted assignment', () => {
      const assignment = RoleAssignment.reconstitute(
        createPersistedAssignment(),
      );

      expect(assignment.id).toBe('assignment-1');
      expect(assignment.roleId).toBe('role-1');
      expect(assignment.isRevoked()).toBe(false);
    });

    it('reconstitutes historical assignments even when their Role is archived', () => {
      const archivedRole = createOrganizationRole({
        status: ROLE_STATUS.ARCHIVED,
      });

      const assignment = RoleAssignment.reconstitute(
        createPersistedAssignment({ role: archivedRole }),
      );

      expect(assignment.isRevoked()).toBe(false);
      expect(assignment.isEffectiveForAuthorization(archivedRole)).toBe(false);
    });

    it('preserves a revoked assignment', () => {
      const assignment = RoleAssignment.reconstitute(
        createPersistedAssignment({ revokedAt: REVOKED_AT }),
      );

      expect(assignment.revokedAt).toEqual(REVOKED_AT);
      expect(assignment.isRevoked()).toBe(true);
    });

    it('rejects a revocation date before creation', () => {
      expect(() =>
        RoleAssignment.reconstitute(
          createPersistedAssignment({
            revokedAt: new Date(CREATED_AT.getTime() - 1),
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: ROLE_ASSIGNMENT_ERROR_CODE.REVOCATION_BEFORE_CREATION,
        }),
      );
    });
  });

  describe('revocation and effectiveness', () => {
    it('revokes an active assignment once', () => {
      const assignment = createOrganizationAssignment();

      expect(assignment.revoke(REVOKED_AT)).toBe(true);
      expect(assignment.revokedAt).toEqual(REVOKED_AT);
      expect(assignment.isRevoked()).toBe(true);
      expect(assignment.revoke(REVOKED_AT)).toBe(false);
    });

    it('rejects invalid or earlier revocation dates without mutation', () => {
      const assignment = createOrganizationAssignment();

      expect(assignment.revoke(new Date(Number.NaN))).toBe(false);
      expect(assignment.revoke(new Date(CREATED_AT.getTime() - 1))).toBe(false);
      expect(assignment.revokedAt).toBeNull();
    });

    it('requires the matching active Role to be effective', () => {
      const role = createOrganizationRole();
      const assignment = createOrganizationAssignment({ role });

      expect(assignment.isEffectiveForAuthorization(role)).toBe(true);

      role.archive();

      expect(assignment.isEffectiveForAuthorization(role)).toBe(false);
    });

    it('does not treat an assignment to another Role as effective', () => {
      const assignment = createOrganizationAssignment();

      const anotherRole = createOrganizationRole({
        id: 'another-role',
      });

      expect(assignment.isEffectiveForAuthorization(anotherRole)).toBe(false);
    });

    it('returns defensive copies of dates', () => {
      const assignment = createOrganizationAssignment();
      const returnedDate = assignment.createdAt;

      returnedDate.setUTCFullYear(2035);

      expect(assignment.createdAt).toEqual(CREATED_AT);
    });
  });
});
