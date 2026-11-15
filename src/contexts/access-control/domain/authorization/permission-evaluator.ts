import { isKnownPermissionCode } from '../rules/role-permission-scope.rule.js';
import {
  PERMISSION_CATALOG,
  PERMISSION_RESOURCE_LEVEL,
} from '../permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_TARGET,
  ROLE_DEFINITION_SOURCE,
} from '../roles/role.types.js';
import { Role } from '../roles/role.js';
import { RoleAssignment } from '../role-assignments/role-assignment.js';
import {
  PermissionOverride,
  PERMISSION_OVERRIDE_EFFECT,
} from '../permission-overrides/permission-override.js';
import {
  AUTHORIZATION_DECISION_REASON,
  AuthorizationDecision,
  type AuthorizationDecisionContext,
  type AuthorizationDecisionReason,
} from './authorization-decision.js';
import type {
  AuthorizationBranchMembershipSnapshot,
  AuthorizationBranchSnapshot,
  AuthorizationOrganizationMembershipSnapshot,
  AuthorizationOrganizationSnapshot,
  CheckPermissionInput,
} from './authorization.types.js';

export interface AuthorizationSnapshot {
  readonly organization: AuthorizationOrganizationSnapshot | null;
  readonly organizationMembership: AuthorizationOrganizationMembershipSnapshot | null;
  readonly branch?: AuthorizationBranchSnapshot | null;
  readonly branchMemberships?: readonly AuthorizationBranchMembershipSnapshot[];
  readonly roles: readonly Role[];
  readonly roleAssignments: readonly RoleAssignment[];
  readonly permissionOverrides?: readonly PermissionOverride[];
}

export interface EvaluatePermissionInput {
  readonly request: CheckPermissionInput;
  /**
   * A consistent, current snapshot assembled by the Application/Infrastructure
   * boundary. The evaluator itself never queries persistence or external APIs.
   */
  readonly snapshot: AuthorizationSnapshot;
}

export class PermissionEvaluator {
  evaluate(input: EvaluatePermissionInput): AuthorizationDecision {
    const { request, snapshot } = input;

    const permissionCode = request.permissionCode;
    const organizationId = request.organizationId;
    const userId = request.userId;

    const resourceLevel = isKnownPermissionCode(permissionCode)
      ? PERMISSION_CATALOG[permissionCode].resourceLevel
      : null;

    const branchId =
      resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH
        ? request.branchId?.trim() || null
        : null;

    const context: AuthorizationDecisionContext = {
      permissionCode,
      resourceLevel,
      organizationId,
      branchId,
    };

    const deny = (
      reasonCode: AuthorizationDecisionReason,
    ): AuthorizationDecision => AuthorizationDecision.deny(reasonCode, context);

    const allow = (
      reasonCode: AuthorizationDecisionReason,
    ): AuthorizationDecision =>
      AuthorizationDecision.allow(reasonCode, context);

    // 1. Validate the request and permission registry entry.
    if (!userId.trim()) {
      return deny(AUTHORIZATION_DECISION_REASON.USER_ID_REQUIRED);
    }

    if (!organizationId.trim()) {
      return deny(AUTHORIZATION_DECISION_REASON.ORGANIZATION_ID_REQUIRED);
    }

    if (!isKnownPermissionCode(permissionCode)) {
      return deny(AUTHORIZATION_DECISION_REASON.PERMISSION_UNKNOWN);
    }

    if (
      resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH &&
      branchId === null
    ) {
      return deny(AUTHORIZATION_DECISION_REASON.BRANCH_REQUIRED);
    }

    // 2. Validate the Organization and its membership.
    const organization = snapshot.organization;

    if (!organization || organization.id !== organizationId) {
      return deny(AUTHORIZATION_DECISION_REASON.ORGANIZATION_NOT_FOUND);
    }

    if (organization.status !== 'ACTIVE') {
      return deny(AUTHORIZATION_DECISION_REASON.ORGANIZATION_INACTIVE);
    }

    const organizationMembership = snapshot.organizationMembership;

    if (
      !organizationMembership ||
      organizationMembership.userId !== userId ||
      organizationMembership.organizationId !== organizationId
    ) {
      return deny(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_FOUND,
      );
    }

    if (organizationMembership.status !== 'ACTIVE') {
      return deny(
        AUTHORIZATION_DECISION_REASON.ORGANIZATION_MEMBERSHIP_NOT_ACTIVE,
      );
    }

    // 3. Branch context is mandatory and validated for Branch permissions.
    let branch: AuthorizationBranchSnapshot | null = null;

    if (resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH) {
      branch = snapshot.branch ?? null;

      if (!branch || branch.id !== branchId) {
        return deny(AUTHORIZATION_DECISION_REASON.BRANCH_NOT_FOUND);
      }

      if (branch.organizationId !== organizationId) {
        return deny(AUTHORIZATION_DECISION_REASON.BRANCH_ORGANIZATION_MISMATCH);
      }

      if (branch.status !== 'ACTIVE') {
        return deny(AUTHORIZATION_DECISION_REASON.BRANCH_INACTIVE);
      }
    }

    // 4. Explicit DENY overrides always take precedence.
    // Global context validation has already succeeded and cannot be bypassed.
    const matchingOverrides = (snapshot.permissionOverrides ?? []).filter(
      (override) =>
        override instanceof PermissionOverride &&
        override.organizationId === organizationId &&
        override.organizationMembershipId === organizationMembership.id &&
        override.permissionCode === permissionCode &&
        resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH &&
        override.branchId === branchId,
    );

    if (
      matchingOverrides.some(
        (override) => override.effect === PERMISSION_OVERRIDE_EFFECT.DENY,
      )
    ) {
      return deny(AUTHORIZATION_DECISION_REASON.OVERRIDE_DENY);
    }

    if (
      matchingOverrides.some(
        (override) => override.effect === PERMISSION_OVERRIDE_EFFECT.ALLOW,
      )
    ) {
      return allow(AUTHORIZATION_DECISION_REASON.OVERRIDE_ALLOW);
    }

    // 5. Evaluate valid RoleAssignments.
    const rolesById = new Map(
      snapshot.roles.map((role) => [role.getId().getValue(), role]),
    );

    const hasOrganizationRoleGrant = snapshot.roleAssignments.some(
      (assignment) => {
        if (
          !(assignment instanceof RoleAssignment) ||
          assignment.organizationMembershipId !== organizationMembership.id ||
          assignment.branchMembershipId !== null ||
          assignment.organizationId !== organizationId
        ) {
          return false;
        }

        const role = rolesById.get(assignment.roleId);

        return (
          role !== undefined &&
          role.getAssignmentTarget() === ROLE_ASSIGNMENT_TARGET.ORGANIZATION &&
          this.isRoleOwnedByOrganization(role, organizationId) &&
          assignment.isEffectiveForAuthorization(role) &&
          role.getPermissionCodes().includes(permissionCode)
        );
      },
    );

    if (hasOrganizationRoleGrant) {
      return allow(AUTHORIZATION_DECISION_REASON.ROLE_GRANT);
    }

    // Branch assignments are considered only for Branch-level permissions.
    // Inactive BranchMembership records suppress their own assignments, but
    // they do not suppress inherited grants from Organization assignments.
    if (resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH && branch !== null) {
      const applicableBranchMemberships = (
        snapshot.branchMemberships ?? []
      ).filter(
        (membership) =>
          membership.status === 'ACTIVE' &&
          membership.organizationMembershipId === organizationMembership.id &&
          membership.organizationId === organizationId &&
          membership.branchId === branch.id,
      );

      const hasBranchRoleGrant = snapshot.roleAssignments.some((assignment) => {
        if (
          !(assignment instanceof RoleAssignment) ||
          assignment.organizationMembershipId !== null ||
          assignment.organizationId !== organizationId ||
          assignment.branchMembershipId === null
        ) {
          return false;
        }

        const branchMembership = applicableBranchMemberships.find(
          (membership) => membership.id === assignment.branchMembershipId,
        );

        if (!branchMembership) {
          return false;
        }

        const role = rolesById.get(assignment.roleId);

        return (
          role !== undefined &&
          role.getAssignmentTarget() === ROLE_ASSIGNMENT_TARGET.BRANCH &&
          this.isRoleOwnedByOrganization(role, organizationId) &&
          assignment.isEffectiveForAuthorization(role) &&
          role.getPermissionCodes().includes(permissionCode)
        );
      });

      if (hasBranchRoleGrant) {
        return allow(AUTHORIZATION_DECISION_REASON.ROLE_GRANT);
      }
    }

    return deny(AUTHORIZATION_DECISION_REASON.NO_PERMISSION_GRANT);
  }

  private isRoleOwnedByOrganization(
    role: Role,
    organizationId: string,
  ): boolean {
    if (role.getDefinitionSource() === ROLE_DEFINITION_SOURCE.SYSTEM) {
      return role.getOrganizationId() === null;
    }

    return role.getOrganizationId() === organizationId;
  }
}
