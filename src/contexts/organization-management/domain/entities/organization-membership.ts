import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  MEMBERSHIP_STATUS,
  type MembershipStatus,
} from '../types/lifecycle-status.js';
import {
  ORGANIZATION_MEMBERSHIP_ERROR_CODE,
  InvalidOrganizationMembershipDataError,
} from '../errors/invalid-organization-membership.error.js';

// Input required to create a new OrganizationMembership.
export interface CreateOrganizationMembershipInput {
  readonly id?: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly status?: MembershipStatus;
}

// Data used to reconstruct an existing OrganizationMembership.
export interface OrganizationMembershipProps {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Internal state of the OrganizationMembership entity.
interface OrganizationMembershipState {
  readonly id: UniqueId;
  readonly organizationId: string;
  readonly userId: string;
  status: MembershipStatus;
  readonly createdAt: Date;
  updatedAt: Date;
}

export class OrganizationMembership extends Entity<UniqueId> {
  private readonly _organizationId: string;
  private readonly _userId: string;
  private _status: MembershipStatus;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: OrganizationMembershipState) {
    super(props.id);

    this._organizationId = props.organizationId;
    this._userId = props.userId;
    this._status = props.status;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // Factory method: creates a new OrganizationMembership.
  static create(
    input: CreateOrganizationMembershipInput,
  ): OrganizationMembership {
    const organizationId = input.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Organization membership organization ID is required.',
      );
    }

    const userId = input.userId.trim();

    if (userId.length === 0) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.USER_ID_REQUIRED,
        'Organization membership user ID is required.',
      );
    }

    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.ID_REQUIRED,
        'Organization membership ID is required.',
      );
    }

    const status = input.status ?? MEMBERSHIP_STATUS.INVITED;

    if (!this.isValidStatus(status)) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.STATUS_INVALID,
        'Organization membership status is invalid.',
      );
    }

    const now = new Date();

    return new OrganizationMembership({
      id: new UniqueId(id),
      organizationId,
      userId,
      status,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Reconstitution method: restores an existing OrganizationMembership.
  static reconstitute(
    props: OrganizationMembershipProps,
  ): OrganizationMembership {
    const id = props.id.trim();

    if (id.length === 0) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.ID_REQUIRED,
        'Organization membership ID is required.',
      );
    }

    const organizationId = props.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Organization membership organization ID is required.',
      );
    }

    const userId = props.userId.trim();

    if (userId.length === 0) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.USER_ID_REQUIRED,
        'Organization membership user ID is required.',
      );
    }

    if (!this.isValidStatus(props.status)) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.STATUS_INVALID,
        'Organization membership status is invalid.',
      );
    }

    if (!this.hasValidTimestamps(props.createdAt, props.updatedAt)) {
      throw new InvalidOrganizationMembershipDataError(
        ORGANIZATION_MEMBERSHIP_ERROR_CODE.TIMESTAMPS_INVALID,
        'Organization membership timestamps are invalid.',
      );
    }

    return new OrganizationMembership({
      id: new UniqueId(id),
      organizationId,
      userId,
      status: props.status,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  private static isValidStatus(status: MembershipStatus): boolean {
    return Object.values(MEMBERSHIP_STATUS).some(
      (validStatus) => validStatus === status,
    );
  }

  private static hasValidTimestamps(createdAt: Date, updatedAt: Date): boolean {
    if (
      !(createdAt instanceof Date) ||
      Number.isNaN(createdAt.getTime()) ||
      !(updatedAt instanceof Date) ||
      Number.isNaN(updatedAt.getTime())
    ) {
      return false;
    }

    return createdAt.getTime() <= updatedAt.getTime();
  }

  // GETTERS

  get id(): string {
    return this.getId().getValue();
  }

  get organizationId(): string {
    return this._organizationId;
  }

  get userId(): string {
    return this._userId;
  }

  get status(): MembershipStatus {
    return this._status;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  // DOMAIN BEHAVIORS

  activate(): boolean {
    if (
      this._status === MEMBERSHIP_STATUS.ACTIVE ||
      this._status === MEMBERSHIP_STATUS.REMOVED
    ) {
      return false;
    }

    this._status = MEMBERSHIP_STATUS.ACTIVE;
    this.touch();

    return true;
  }

  suspend(): boolean {
    if (this._status !== MEMBERSHIP_STATUS.ACTIVE) {
      return false;
    }

    this._status = MEMBERSHIP_STATUS.SUSPENDED;
    this.touch();

    return true;
  }

  remove(): boolean {
    if (this._status === MEMBERSHIP_STATUS.REMOVED) {
      return false;
    }

    this._status = MEMBERSHIP_STATUS.REMOVED;
    this.touch();

    return true;
  }

  isActive(): boolean {
    return this._status === MEMBERSHIP_STATUS.ACTIVE;
  }

  // PRIVATE METHODS

  private touch(): void {
    this._updatedAt = new Date();
  }
}
