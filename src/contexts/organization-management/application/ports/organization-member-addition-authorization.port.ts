export const ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT = Symbol(
  'ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT',
);

export interface OrganizationMemberAdditionAuthorizationPort {
  canAddOrganizationMember(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<boolean>;
}
