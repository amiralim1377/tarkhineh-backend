import type {
  PermissionOverride,
  PermissionOverrideBranchReference,
  PermissionOverrideMembershipReference,
} from '../../domain/permission-overrides/permission-override.js';

export const PERMISSION_OVERRIDE_REPOSITORY = Symbol(
  'PERMISSION_OVERRIDE_REPOSITORY',
);

export interface ActivePermissionOverrideTarget {
  readonly organizationMembership: PermissionOverrideMembershipReference;
  readonly branch: PermissionOverrideBranchReference;
}

/**
 * Persistence contract for branch-specific member Permission overrides.
 *
 * findActiveTarget must verify that the Organization, OrganizationMembership,
 * and Branch are ACTIVE and tenant-consistent. BranchMembership is
 * deliberately not required: Organization members can have overrides for
 * individual Branches without belonging to those Branches.
 */
export interface PermissionOverrideRepository {
  findActiveTarget(input: {
    readonly organizationId: string;
    readonly organizationMembershipId: string;
    readonly branchId: string;
  }): Promise<ActivePermissionOverrideTarget | null>;

  findByUniqueKey(input: {
    readonly organizationId: string;
    readonly organizationMembershipId: string;
    readonly branchId: string;
    readonly permissionCode: string;
  }): Promise<PermissionOverride | null>;

  save(override: PermissionOverride): Promise<void>;
  update(override: PermissionOverride): Promise<void>;
  delete(override: PermissionOverride): Promise<void>;
}
