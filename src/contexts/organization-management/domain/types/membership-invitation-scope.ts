export const MEMBERSHIP_INVITATION_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;

export type MembershipInvitationScope =
  (typeof MEMBERSHIP_INVITATION_SCOPE)[keyof typeof MEMBERSHIP_INVITATION_SCOPE];
