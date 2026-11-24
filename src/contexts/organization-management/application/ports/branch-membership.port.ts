import type { BranchMembership } from '../../domain/entities/branch-membership.js';

export const BRANCH_MEMBERSHIP_PORT = Symbol('BRANCH_MEMBERSHIP_PORT');

export interface BranchMembershipPort {
  findByBranchAndOrganizationMembership(
    organizationId: string,
    branchId: string,
    organizationMembershipId: string,
  ): Promise<BranchMembership | null>;

  save(membership: BranchMembership): Promise<void>;

  findById(
    organizationId: string,
    membershipId: string,
  ): Promise<BranchMembership | null>;

  update(membership: BranchMembership): Promise<void>;
}
