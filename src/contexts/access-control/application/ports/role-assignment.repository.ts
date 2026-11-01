import type { RoleAssignment } from '../../domain/role-assignments/role-assignment.js';
import type { RoleAssignmentMembershipReference } from '../../domain/role-assignments/role-assignment.js';

export const ROLE_ASSIGNMENT_REPOSITORY = Symbol('ROLE_ASSIGNMENT_REPOSITORY');

export interface ActiveBranchAssignmentTarget extends RoleAssignmentMembershipReference {
  readonly branchId: string;
}

/**
 * Persistence contract for generic Role assignment.
 *
 * Active-membership readers must return null unless the Organization,
 * OrganizationMembership, and (for Branch targets) Branch and
 * BranchMembership are all ACTIVE and tenant-consistent.
 *
 * The database partial unique constraints remain authoritative against
 * concurrent duplicate assignment attempts. The existence check is only
 * an early application-level conflict check.
 *
 * When supplied by AccessControlUnitOfWork, every method must use its
 * transaction-bound client and must not open or manage another transaction.
 */
export interface RoleAssignmentRepository {
  findActiveOrganizationMembership(
    organizationId: string,
    organizationMembershipId: string,
  ): Promise<RoleAssignmentMembershipReference | null>;

  findActiveBranchMembership(
    organizationId: string,
    branchId: string,
    branchMembershipId: string,
  ): Promise<ActiveBranchAssignmentTarget | null>;

  existsActiveForTarget(input: {
    readonly roleId: string;
    readonly organizationMembershipId?: string;
    readonly branchMembershipId?: string;
  }): Promise<boolean>;

  /**
   * Finds an assignment only when its target matches the supplied context.
   * Without branchId, match an OrganizationMembership assignment.
   * With branchId, match a BranchMembership assignment in that exact Branch.
   * Historical revoked assignments must also be returned.
   */
  findByIdForRevocation(input: {
    readonly organizationId: string;
    readonly assignmentId: string;
    readonly branchId?: string;
  }): Promise<RoleAssignment | null>;

  save(assignment: RoleAssignment): Promise<void>;
  update(assignment: RoleAssignment): Promise<void>;
}
