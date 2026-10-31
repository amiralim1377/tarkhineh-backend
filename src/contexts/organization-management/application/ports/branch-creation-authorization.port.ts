export const BRANCH_CREATION_AUTHORIZATION_PORT = Symbol(
  'BRANCH_CREATION_AUTHORIZATION_PORT',
);

export interface BranchCreationAuthorizationPort {
  canCreateBranch(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<boolean>;
}
