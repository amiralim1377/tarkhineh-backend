export const BRANCH_UPDATE_AUTHORIZATION_PORT = Symbol(
  'BRANCH_UPDATE_AUTHORIZATION_PORT',
);

export interface BranchUpdateAuthorizationPort {
  canUpdateBranch(input: {
    actorUserId: string;
    organizationId: string;
    branchId: string;
  }): Promise<boolean>;
}
