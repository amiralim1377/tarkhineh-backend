import type { OrganizationMembershipPort } from './organization-membership.port.js';
import type { BranchMembershipPort } from './branch-membership.port.js';

export const BRANCH_MEMBER_ADDITION_UNIT_OF_WORK = Symbol(
  'BRANCH_MEMBER_ADDITION_UNIT_OF_WORK',
);

export interface BranchMemberAdditionUnitOfWorkContext {
  readonly organizationMembershipRepository: OrganizationMembershipPort;
  readonly branchMembershipRepository: BranchMembershipPort;
}

export interface BranchMemberAdditionUnitOfWork {
  execute<T>(
    operation: (context: BranchMemberAdditionUnitOfWorkContext) => Promise<T>,
  ): Promise<T>;
}
