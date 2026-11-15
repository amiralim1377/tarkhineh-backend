export const ORGANIZATION_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type OrganizationStatus =
  (typeof ORGANIZATION_STATUS)[keyof typeof ORGANIZATION_STATUS];

export const BRANCH_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type BranchStatus = (typeof BRANCH_STATUS)[keyof typeof BRANCH_STATUS];

export const MEMBERSHIP_STATUS = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REMOVED: 'REMOVED',
} as const;

export type MembershipStatus =
  (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];
