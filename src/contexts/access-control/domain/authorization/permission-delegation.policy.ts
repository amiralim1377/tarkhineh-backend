import {
  PERMISSION_CATALOG,
  PERMISSION_CODE,
  PERMISSION_TARGET_SCOPE,
} from '../permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SCOPE,
} from '../roles/role.types.js';
import { Role } from '../roles/role.js';
import {
  PERMISSION_OVERRIDE_EFFECT,
  type PermissionOverrideEffect,
} from '../permission-overrides/permission-override.js';

export const DELEGATION_DECISION_REASON = {
  ALLOWED: 'ALLOWED',
  ROLE_NOT_ASSIGNABLE: 'ROLE_NOT_ASSIGNABLE',
  ROLE_NOT_ORGANIZATION_DEFINED: 'ROLE_NOT_ORGANIZATION_DEFINED',
  ROLE_ORGANIZATION_MISMATCH: 'ROLE_ORGANIZATION_MISMATCH',
  MANAGEMENT_PERMISSION_MISSING: 'MANAGEMENT_PERMISSION_MISSING',
  PERMISSION_UNKNOWN: 'PERMISSION_UNKNOWN',
  PERMISSION_NOT_DELEGABLE: 'PERMISSION_NOT_DELEGABLE',
  ACTOR_PERMISSION_NOT_HELD: 'ACTOR_PERMISSION_NOT_HELD',
  OVERRIDE_PERMISSION_SCOPE_INVALID: 'OVERRIDE_PERMISSION_SCOPE_INVALID',
  OVERRIDE_EFFECT_INVALID: 'OVERRIDE_EFFECT_INVALID',
} as const;

export type DelegationDecisionReason =
  (typeof DELEGATION_DECISION_REASON)[keyof typeof DELEGATION_DECISION_REASON];

export interface DelegationDecision {
  readonly allowed: boolean;
  readonly reasonCode: DelegationDecisionReason;
  readonly permissionCode?: string;
}

export interface DelegatePermissionsInput {
  readonly permissionCodes: readonly string[];
  readonly actorEffectivePermissionCodes: readonly string[];
}

export interface ComposeRoleInput {
  readonly role: Role;
  readonly organizationId: string;
  readonly operation: 'CREATE' | 'UPDATE';
  readonly actorEffectivePermissionCodes: readonly string[];
}

export interface AssignRoleInput {
  readonly role: Role;
  readonly targetOrganizationId: string;
  readonly actorEffectivePermissionCodes: readonly string[];
}

export interface SetPermissionOverrideInput {
  readonly permissionCode: string;
  readonly effect: PermissionOverrideEffect;
  readonly actorEffectivePermissionCodes: readonly string[];
}

function allowed(): DelegationDecision {
  return {
    allowed: true,
    reasonCode: DELEGATION_DECISION_REASON.ALLOWED,
  };
}

function denied(
  reasonCode: DelegationDecisionReason,
  permissionCode?: string,
): DelegationDecision {
  return {
    allowed: false,
    reasonCode,
    ...(permissionCode === undefined ? {} : { permissionCode }),
  };
}

/**
 * Pure policy for controlled delegation.
 *
 * The Application layer supplies the actor's current effective permissions.
 * This policy never loads assignments, memberships, or persistence data.
 */
export class PermissionDelegationPolicy {
  /**
   * A permission can be delegated only when:
   * 1. It exists in the source-controlled registry.
   * 2. Its explicit delegable flag is true.
   * 3. The actor currently holds it effectively.
   */
  canDelegatePermissions(input: DelegatePermissionsInput): DelegationDecision {
    const actorPermissions = new Set(input.actorEffectivePermissionCodes);

    for (const permissionCode of new Set(input.permissionCodes)) {
      if (!Object.hasOwn(PERMISSION_CATALOG, permissionCode)) {
        return denied(
          DELEGATION_DECISION_REASON.PERMISSION_UNKNOWN,
          permissionCode,
        );
      }

      const definition =
        PERMISSION_CATALOG[permissionCode as keyof typeof PERMISSION_CATALOG];

      if (!definition.delegable) {
        return denied(
          DELEGATION_DECISION_REASON.PERMISSION_NOT_DELEGABLE,
          permissionCode,
        );
      }

      if (!actorPermissions.has(permissionCode)) {
        return denied(
          DELEGATION_DECISION_REASON.ACTOR_PERMISSION_NOT_HELD,
          permissionCode,
        );
      }
    }

    return allowed();
  }

  /**
   * Creates or updates an Organization-defined Role.
   * Management authority and permission delegation are independent checks.
   */
  canComposeRole(input: ComposeRoleInput): DelegationDecision {
    if (
      !(input.role instanceof Role) ||
      input.role.getDefinitionScope() !== ROLE_DEFINITION_SCOPE.ORGANIZATION
    ) {
      return denied(DELEGATION_DECISION_REASON.ROLE_NOT_ORGANIZATION_DEFINED);
    }

    const organizationId = input.organizationId.trim();

    if (!organizationId || input.role.getOrganizationId() !== organizationId) {
      return denied(DELEGATION_DECISION_REASON.ROLE_ORGANIZATION_MISMATCH);
    }

    const managementPermission =
      input.operation === 'CREATE'
        ? PERMISSION_CODE.ORGANIZATION_ROLES_CREATE
        : PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE;

    if (!input.actorEffectivePermissionCodes.includes(managementPermission)) {
      return denied(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
        managementPermission,
      );
    }

    return this.canDelegatePermissions({
      permissionCodes: input.role.getPermissionCodes(),
      actorEffectivePermissionCodes: input.actorEffectivePermissionCodes,
    });
  }

  /**
   * Assigning a Role requires both assignment authority at the relevant
   * scope and delegation authority for every permission in that Role.
   */
  canAssignRole(input: AssignRoleInput): DelegationDecision {
    const { role } = input;

    if (
      !(role instanceof Role) ||
      !role.canBeAssignedThroughGenericWorkflow()
    ) {
      return denied(DELEGATION_DECISION_REASON.ROLE_NOT_ASSIGNABLE);
    }

    if (
      role.getDefinitionScope() === ROLE_DEFINITION_SCOPE.ORGANIZATION &&
      role.getOrganizationId() !== input.targetOrganizationId.trim()
    ) {
      return denied(DELEGATION_DECISION_REASON.ROLE_ORGANIZATION_MISMATCH);
    }

    const managementPermission =
      role.getAssignmentScope() === ROLE_ASSIGNMENT_SCOPE.ORGANIZATION
        ? PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN
        : PERMISSION_CODE.BRANCH_ROLES_ASSIGN;

    if (!input.actorEffectivePermissionCodes.includes(managementPermission)) {
      return denied(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
        managementPermission,
      );
    }

    return this.canDelegatePermissions({
      permissionCodes: role.getPermissionCodes(),
      actorEffectivePermissionCodes: input.actorEffectivePermissionCodes,
    });
  }

  /**
   * Both ALLOW and DENY overrides require override-management authority.
   * ALLOW additionally requires the actor to be able to delegate the
   * permission. DENY only reduces access and therefore does not.
   */
  canSetPermissionOverride(
    input: SetPermissionOverrideInput,
  ): DelegationDecision {
    const managementPermission =
      PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE;

    if (!input.actorEffectivePermissionCodes.includes(managementPermission)) {
      return denied(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
        managementPermission,
      );
    }

    if (!Object.hasOwn(PERMISSION_CATALOG, input.permissionCode)) {
      return denied(
        DELEGATION_DECISION_REASON.PERMISSION_UNKNOWN,
        input.permissionCode,
      );
    }

    const definition =
      PERMISSION_CATALOG[
        input.permissionCode as keyof typeof PERMISSION_CATALOG
      ];

    if (definition.targetScope !== PERMISSION_TARGET_SCOPE.BRANCH) {
      return denied(
        DELEGATION_DECISION_REASON.OVERRIDE_PERMISSION_SCOPE_INVALID,
        input.permissionCode,
      );
    }

    if (
      input.effect !== PERMISSION_OVERRIDE_EFFECT.ALLOW &&
      input.effect !== PERMISSION_OVERRIDE_EFFECT.DENY
    ) {
      return denied(DELEGATION_DECISION_REASON.OVERRIDE_EFFECT_INVALID);
    }

    if (input.effect === PERMISSION_OVERRIDE_EFFECT.DENY) {
      return allowed();
    }

    return this.canDelegatePermissions({
      permissionCodes: [input.permissionCode],
      actorEffectivePermissionCodes: input.actorEffectivePermissionCodes,
    });
  }
}
