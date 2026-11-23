import type { MembershipInvitation } from '../../domain/entities/membership-invitation.js';

export const MEMBERSHIP_INVITATION_PORT = Symbol('MEMBERSHIP_INVITATION_PORT');

export interface MembershipInvitationPort {
  save(invitation: MembershipInvitation): Promise<void>;

  update(invitation: MembershipInvitation): Promise<void>;

  findById(
    organizationId: string,
    invitationId: string,
  ): Promise<MembershipInvitation | null>;

  findByTokenHash(tokenHash: string): Promise<MembershipInvitation | null>;

  findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
  ): Promise<MembershipInvitation | null>;

  findPendingByBranchAndEmail(
    organizationId: string,
    branchId: string,
    email: string,
  ): Promise<MembershipInvitation | null>;
}
