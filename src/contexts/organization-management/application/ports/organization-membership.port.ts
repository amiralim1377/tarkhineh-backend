import type { OrganizationMembership } from '../../domain/entities/organization-membership.js';

export const ORGANIZATION_MEMBERSHIP_PORT = Symbol(
  'ORGANIZATION_MEMBERSHIP_PORT',
);

export interface OrganizationMembershipPort {
  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null>;

  save(membership: OrganizationMembership): Promise<void>;

  findById(
    organizationId: string,
    membershipId: string,
  ): Promise<OrganizationMembership | null>;

  update(membership: OrganizationMembership): Promise<void>;
}
