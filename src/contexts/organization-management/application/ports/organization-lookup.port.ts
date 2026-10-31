export const ORGANIZATION_LOOKUP_PORT = Symbol('ORGANIZATION_LOOKUP_PORT');

export interface OrganizationLookupPort {
  existsById(organizationId: string): Promise<boolean>;
}
