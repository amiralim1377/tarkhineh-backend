import type { MembershipInvitationScope } from '../../domain/types/membership-invitation-scope.js';

export const MEMBERSHIP_INVITATION_EMAIL_PORT = Symbol(
  'MEMBERSHIP_INVITATION_EMAIL_PORT',
);

export interface EnqueueMembershipInvitationEmailInput {
  readonly invitationId: string;
  readonly email: string;
  readonly rawToken: string;
  readonly scope: MembershipInvitationScope;
  readonly organizationName: string;
  readonly branchName?: string;
  readonly expiresAt: Date;
}

export interface MembershipInvitationEmailPort {
  enqueueInvitationEmail(
    input: EnqueueMembershipInvitationEmailInput,
  ): Promise<void>;
}
