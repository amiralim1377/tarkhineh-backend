import type { PermissionTargetScope } from '../permissions/permission-catalog.js';

export const AUTHORIZATION_DECISION_REASON = {
  USER_ID_REQUIRED: 'USER_ID_REQUIRED',
  ORGANIZATION_ID_REQUIRED: 'ORGANIZATION_ID_REQUIRED',
  PERMISSION_UNKNOWN: 'PERMISSION_UNKNOWN',
  BRANCH_REQUIRED: 'BRANCH_REQUIRED',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  ORGANIZATION_INACTIVE: 'ORGANIZATION_INACTIVE',
  ORGANIZATION_MEMBERSHIP_NOT_FOUND: 'ORGANIZATION_MEMBERSHIP_NOT_FOUND',
  ORGANIZATION_MEMBERSHIP_NOT_ACTIVE: 'ORGANIZATION_MEMBERSHIP_NOT_ACTIVE',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  BRANCH_ORGANIZATION_MISMATCH: 'BRANCH_ORGANIZATION_MISMATCH',
  BRANCH_INACTIVE: 'BRANCH_INACTIVE',
  OVERRIDE_DENY: 'OVERRIDE_DENY',
  OVERRIDE_ALLOW: 'OVERRIDE_ALLOW',
  ROLE_GRANT: 'ROLE_GRANT',
  NO_PERMISSION_GRANT: 'NO_PERMISSION_GRANT',
} as const;

export type AuthorizationDecisionReason =
  (typeof AUTHORIZATION_DECISION_REASON)[keyof typeof AUTHORIZATION_DECISION_REASON];

export interface AuthorizationDecisionContext {
  readonly permissionCode: string;
  readonly targetScope: PermissionTargetScope | null;
  readonly organizationId: string;
  readonly branchId: string | null;
}

export class AuthorizationDecision {
  private constructor(
    readonly allowed: boolean,
    readonly reasonCode: AuthorizationDecisionReason,
    readonly context: AuthorizationDecisionContext,
  ) {}

  static allow(
    reasonCode: AuthorizationDecisionReason,
    context: AuthorizationDecisionContext,
  ): AuthorizationDecision {
    return new AuthorizationDecision(true, reasonCode, context);
  }

  static deny(
    reasonCode: AuthorizationDecisionReason,
    context: AuthorizationDecisionContext,
  ): AuthorizationDecision {
    return new AuthorizationDecision(false, reasonCode, context);
  }

  isAllowed(): boolean {
    return this.allowed;
  }

  isDenied(): boolean {
    return !this.allowed;
  }
}
