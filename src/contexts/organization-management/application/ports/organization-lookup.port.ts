import type { OrganizationStatus } from '../../domain/types/lifecycle-status.js';

export const ORGANIZATION_LOOKUP_PORT = Symbol('ORGANIZATION_LOOKUP_PORT');

export interface OrganizationLookupPort {
  findStatusById(organizationId: string): Promise<OrganizationStatus | null>;
}
