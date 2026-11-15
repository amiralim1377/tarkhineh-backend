import type {
  OrganizationStatus,
  BranchStatus,
  MembershipStatus,
} from '../../../organization-management/contracts/lifecycle-status.contract.js';

export interface AuthorizationContextInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly branchId?: string;
}

export interface CheckPermissionInput extends AuthorizationContextInput {
  readonly permissionCode: string;
}

export interface AuthorizationOrganizationSnapshot {
  readonly id: string;
  readonly status: OrganizationStatus;
}

export interface AuthorizationOrganizationMembershipSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly status: MembershipStatus;
}

export interface AuthorizationBranchSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly status: BranchStatus;
}

export interface AuthorizationBranchMembershipSnapshot {
  readonly id: string;
  readonly organizationMembershipId: string;
  readonly branchId: string;
  readonly organizationId: string;
  readonly status: MembershipStatus;
}
