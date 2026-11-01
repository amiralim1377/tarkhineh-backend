export interface CheckPermissionInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissionCode: string;
  readonly branchId?: string;
}

export type AuthorizationOrganizationStatus = 'ACTIVE' | 'SUSPENDED';

export type AuthorizationMembershipStatus =
  'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

export type AuthorizationBranchStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthorizationOrganizationSnapshot {
  readonly id: string;
  readonly status: AuthorizationOrganizationStatus;
}

export interface AuthorizationOrganizationMembershipSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly status: AuthorizationMembershipStatus;
}

export interface AuthorizationBranchSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly status: AuthorizationBranchStatus;
}

export interface AuthorizationBranchMembershipSnapshot {
  readonly id: string;
  readonly organizationMembershipId: string;
  readonly branchId: string;
  readonly organizationId: string;
  readonly status: AuthorizationMembershipStatus;
}
