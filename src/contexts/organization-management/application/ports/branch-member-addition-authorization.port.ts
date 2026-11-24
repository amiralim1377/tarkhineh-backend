export const BRANCH_MEMBER_ADDITION_AUTHORIZATION_PORT = Symbol(
  'BRANCH_MEMBER_ADDITION_AUTHORIZATION_PORT',
);

export interface BranchMemberAdditionAuthorizationPort {
  canAddBranchMember(input: {
    actorUserId: string;
    organizationId: string;
    branchId: string;
  }): Promise<boolean>;
}
