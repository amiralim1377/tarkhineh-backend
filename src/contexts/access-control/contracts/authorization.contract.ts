import type { PermissionCode } from './permission-codes.contract.js';

export const ACCESS_CONTROL_AUTHORIZATION = Symbol(
  'ACCESS_CONTROL_AUTHORIZATION',
);

export interface AccessControlAuthorizationInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissionCode: PermissionCode;
  readonly branchId?: string;
}

export interface AccessControlAuthorizationResult {
  readonly allowed: boolean;
}

export interface AccessControlAuthorization {
  checkPermission(
    input: AccessControlAuthorizationInput,
  ): Promise<AccessControlAuthorizationResult>;
}
