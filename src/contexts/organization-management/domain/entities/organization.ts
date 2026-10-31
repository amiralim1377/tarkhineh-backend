import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

import {
  ORGANIZATION_MANAGEMENT_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';
import { OrganizationSlug } from '../value-objects/organization-slug.vo.js';

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED';

// Input required to create a new organization.
export interface CreateOrganizationInput {
  readonly id?: string;
  readonly name: string;
  readonly slug: string;
  readonly ownerUserId: string;
}

// Data used to reconstruct an existing organization.
export interface OrganizationProps {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly ownerUserId: string;
  readonly status: OrganizationStatus;
}

// Internal state of the Organization entity.
interface OrganizationState {
  readonly id: string;
  name: string;
  readonly slug: OrganizationSlug;
  readonly ownerUserId: string;
  status: OrganizationStatus;
}

export class Organization extends Entity<UniqueId> {
  private constructor(private readonly props: OrganizationState) {
    super(new UniqueId(props.id));
  }

  // Factory method: creates a new organization.
  static create(input: CreateOrganizationInput): Organization {
    const organizationName = input.name.trim();

    if (organizationName.length === 0) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
        'Organization name is required.',
      );
    }

    const ownerUserId = input.ownerUserId.trim();

    if (ownerUserId.length === 0) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
        'Organization owner is required.',
      );
    }

    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
        'Organization ID is required.',
      );
    }

    const organizationId = new UniqueId(id);

    const organizationSlug = OrganizationSlug.create(input.slug);

    // Build the initial organization state.
    const state: OrganizationState = {
      id: organizationId.getValue(),
      name: organizationName,
      slug: organizationSlug,
      ownerUserId,
      status: 'ACTIVE',
    };

    return new Organization(state);
  }

  // Reconstitution method: restores an existing organization.
  static reconstitute(props: OrganizationProps): Organization {
    const id = props.id.trim();

    if (id.length === 0) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
        'Organization ID is required.',
      );
    }

    const organizationName = props.name.trim();

    if (organizationName.length === 0) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
        'Organization name is required.',
      );
    }

    const ownerUserId = props.ownerUserId.trim();

    if (ownerUserId.length === 0) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
        'Organization owner is required.',
      );
    }

    if (props.status !== 'ACTIVE' && props.status !== 'SUSPENDED') {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.STATUS_INVALID,
        'Organization status is invalid.',
      );
    }

    // Reconstruct the slug.
    const organizationSlug = OrganizationSlug.create(props.slug);

    // Persisted slug must already be in its canonical form.
    // Reconstitution must not silently change persisted values.
    if (organizationSlug.getValue() !== props.slug) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
        'Persisted organization slug is not in canonical format.',
      );
    }

    // Restore the original organization state.
    const state: OrganizationState = {
      id,
      name: organizationName,
      slug: organizationSlug,
      ownerUserId,
      status: props.status,
    };

    return new Organization(state);
  }

  // Getters
  get id(): string {
    return this.getId().getValue();
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug.getValue();
  }

  get ownerUserId(): string {
    return this.props.ownerUserId;
  }

  get status(): OrganizationStatus {
    return this.props.status;
  }

  // Domain behaviors

  rename(name: string): void {
    const normalizedName = name.trim();

    if (normalizedName.length === 0) {
      throw new InvalidOrganizationDataError(
        ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
        'Organization name is required.',
      );
    }

    this.props.name = normalizedName;
  }

  suspend(): boolean {
    if (this.props.status === 'SUSPENDED') {
      return false;
    }

    this.props.status = 'SUSPENDED';

    return true;
  }

  activate(): boolean {
    if (this.props.status === 'ACTIVE') {
      return false;
    }

    this.props.status = 'ACTIVE';

    return true;
  }

  isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }
}
