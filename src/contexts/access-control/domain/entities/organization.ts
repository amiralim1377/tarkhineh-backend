import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  ACCESS_CONTROL_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';
import { OrganizationSlug } from '../value-objects/organization-slug.vo.js';

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED';

// Input required to create a new organization
export interface CreateOrganizationInput {
  id?: string;
  name: string;
  slug: string;
  ownerUserId: string;
}

// Data used to reconstruct an existing organization
export interface OrganizationProps {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: OrganizationStatus;
}

// Internal state of the Organization entity
interface OrganizationState {
  id: string;
  name: string;
  slug: OrganizationSlug;
  ownerUserId: string;
  status: OrganizationStatus;
}

export class Organization extends Entity<UniqueId> {
  private constructor(private readonly props: OrganizationState) {
    super(new UniqueId(props.id));
  }

  // Factory method
  static create(input: CreateOrganizationInput): Organization {
    const organizationName = input.name.trim();

    if (organizationName.length === 0) {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
        'Organization name is required.',
      );
    }

    const ownerUserId = input.ownerUserId.trim();

    if (ownerUserId.length === 0) {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
        'Organization owner is required.',
      );
    }

    const organizationId = new UniqueId(input.id);

    const organizationSlug = OrganizationSlug.create(input.slug);

    // 6. Build organization state
    const organizationState: OrganizationState = {
      id: organizationId.getValue(),
      name: organizationName,
      slug: organizationSlug,
      ownerUserId,
      status: 'ACTIVE',
    };

    // 7. Create and return organization entity
    return new Organization(organizationState);
  }

  // Reconstitution method
  static reconstitute(props: OrganizationProps): Organization {
    // 1. Validate organization ID
    const organizationId = props.id.trim();

    if (organizationId.length === 0) {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
        'Organization ID is required.',
      );
    }

    const organizationName = props.name.trim();

    if (organizationName.length === 0) {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
        'Organization name is required.',
      );
    }

    const ownerUserId = props.ownerUserId.trim();

    if (ownerUserId.length === 0) {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
        'Organization owner is required.',
      );
    }

    if (props.status !== 'ACTIVE' && props.status !== 'SUSPENDED') {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.STATUS_INVALID,
        'Organization status is invalid.',
      );
    }

    const organizationSlug = OrganizationSlug.create(props.slug);

    // 6. Build organization state
    const state: OrganizationState = {
      id: organizationId,
      name: organizationName,
      slug: organizationSlug,
      ownerUserId,
      status: props.status,
    };

    // 7. Return reconstructed organization
    return new Organization(state);
  }

  // Getters
  get id(): string {
    throw new Error('Not implemented');
  }

  get name(): string {
    throw new Error('Not implemented');
  }

  get slug(): string {
    throw new Error('Not implemented');
  }

  get ownerUserId(): string {
    throw new Error('Not implemented');
  }

  get status(): OrganizationStatus {
    throw new Error('Not implemented');
  }

  // Domain behaviors
  rename(name: string): void {
    throw new Error('Not implemented');
  }

  suspend(): boolean {
    throw new Error('Not implemented');
  }

  activate(): boolean {
    throw new Error('Not implemented');
  }

  isActive(): boolean {
    throw new Error('Not implemented');
  }
}
