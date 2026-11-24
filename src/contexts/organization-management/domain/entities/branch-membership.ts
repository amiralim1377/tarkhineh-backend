import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  BRANCH_MEMBERSHIP_ERROR_CODE,
  InvalidBranchMembershipDataError,
} from '../errors/invalid-branch-membership.error.js';
import {
  MEMBERSHIP_STATUS,
  type MembershipStatus,
} from '../types/lifecycle-status.js';

// Input required to create a new BranchMembership.
export interface CreateBranchMembershipInput {
  readonly id?: string;
  readonly organizationId: string;
  readonly branchId: string;
  readonly organizationMembershipId: string;
  readonly status?: MembershipStatus;
}

// Data used to reconstruct an existing BranchMembership.
export interface BranchMembershipProps {
  readonly id: string;
  readonly organizationId: string;
  readonly branchId: string;
  readonly organizationMembershipId: string;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Internal state of the BranchMembership entity.
interface BranchMembershipState {
  readonly id: UniqueId;
  readonly organizationId: string;
  readonly branchId: string;
  readonly organizationMembershipId: string;
  status: MembershipStatus;
  readonly createdAt: Date;
  updatedAt: Date;
}

export class BranchMembership extends Entity<UniqueId> {
  private readonly _organizationId: string;
  private readonly _branchId: string;
  private readonly _organizationMembershipId: string;

  private _status: MembershipStatus;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: BranchMembershipState) {
    super(props.id);

    this._organizationId = props.organizationId;
    this._branchId = props.branchId;
    this._organizationMembershipId = props.organizationMembershipId;
    this._status = props.status;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // --------------------------------------------------
  // FACTORY METHODS
  // --------------------------------------------------

  static create(input: CreateBranchMembershipInput): BranchMembership {
    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.ID_REQUIRED,
        'Branch membership ID is required.',
      );
    }

    const organizationId = input.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Branch membership organization ID is required.',
      );
    }

    const branchId = input.branchId.trim();

    if (branchId.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.BRANCH_ID_REQUIRED,
        'Branch membership branch ID is required.',
      );
    }

    const organizationMembershipId = input.organizationMembershipId.trim();

    if (organizationMembershipId.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ID_REQUIRED,
        'Branch membership organization membership ID is required.',
      );
    }

    const status = input.status ?? MEMBERSHIP_STATUS.INVITED;

    if (!this.isValidStatus(status)) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.STATUS_INVALID,
        'Branch membership status is invalid.',
      );
    }

    const now = new Date();

    return new BranchMembership({
      id: new UniqueId(id),
      organizationId,
      branchId,
      organizationMembershipId,
      status,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: BranchMembershipProps): BranchMembership {
    const id = props.id.trim();

    if (id.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.ID_REQUIRED,
        'Branch membership ID is required.',
      );
    }

    const organizationId = props.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Branch membership organization ID is required.',
      );
    }

    const branchId = props.branchId.trim();

    if (branchId.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.BRANCH_ID_REQUIRED,
        'Branch membership branch ID is required.',
      );
    }

    const organizationMembershipId = props.organizationMembershipId.trim();

    if (organizationMembershipId.length === 0) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ID_REQUIRED,
        'Branch membership organization membership ID is required.',
      );
    }

    if (!this.isValidStatus(props.status)) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.STATUS_INVALID,
        'Branch membership status is invalid.',
      );
    }

    if (!this.hasValidTimestamps(props.createdAt, props.updatedAt)) {
      throw new InvalidBranchMembershipDataError(
        BRANCH_MEMBERSHIP_ERROR_CODE.TIMESTAMPS_INVALID,
        'Branch membership timestamps are invalid.',
      );
    }

    return new BranchMembership({
      id: new UniqueId(id),
      organizationId,
      branchId,
      organizationMembershipId,
      status: props.status,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  // --------------------------------------------------
  // PRIVATE VALIDATION METHODS
  // --------------------------------------------------

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

  // --------------------------------------------------
  // GETTERS
  // --------------------------------------------------

  get id(): string {
    return this.getId().getValue();
  }

  get organizationId(): string {
    return this._organizationId;
  }

  get branchId(): string {
    return this._branchId;
  }

  get organizationMembershipId(): string {
    return this._organizationMembershipId;
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

  // --------------------------------------------------
  // DOMAIN BEHAVIORS
  // --------------------------------------------------

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

  isInvited(): boolean {
    return this._status === MEMBERSHIP_STATUS.INVITED;
  }

  isActive(): boolean {
    return this._status === MEMBERSHIP_STATUS.ACTIVE;
  }

  isSuspended(): boolean {
    return this._status === MEMBERSHIP_STATUS.SUSPENDED;
  }

  isRemoved(): boolean {
    return this._status === MEMBERSHIP_STATUS.REMOVED;
  }

  // --------------------------------------------------
  // PRIVATE METHODS
  // --------------------------------------------------

  private touch(): void {
    this._updatedAt = new Date();
  }
}
