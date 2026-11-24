import { MEMBERSHIP_INVITATION_SCOPE } from '../../domain/types/membership-invitation-scope.js';

export const MEMBERSHIP_INVITATION_AUTHORIZATION_PORT = Symbol(
  'MEMBERSHIP_INVITATION_AUTHORIZATION_PORT',
);

export type MembershipInvitationAuthorizationInput =
  | {
      readonly actorUserId: string;
      readonly organizationId: string;
      readonly scope: typeof MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION;
      readonly branchId?: never;
    }
  | {
      readonly actorUserId: string;
      readonly organizationId: string;
      readonly scope: typeof MEMBERSHIP_INVITATION_SCOPE.BRANCH;
      readonly branchId: string;
    };

export interface MembershipInvitationAuthorizationPort {
  canCreateMembershipInvitation(
    input: MembershipInvitationAuthorizationInput,
  ): Promise<boolean>;
}
