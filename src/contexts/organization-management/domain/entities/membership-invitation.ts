import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

import {
  MEMBERSHIP_INVITATION_SCOPE,
  type MembershipInvitationScope,
} from '../types/membership-invitation-scope.js';

import {
  MEMBERSHIP_INVITATION_STATUS,
  type MembershipInvitationStatus,
} from '../types/membership-invitation-status.js';

import {
  MEMBERSHIP_INVITATION_ERROR_CODE,
  InvalidMembershipInvitationDataError,
} from '../errors/invalid-membership-invitation.error.js';

// Input required to create a new MembershipInvitation.
export interface CreateMembershipInvitationInput {
  readonly id?: string;
  readonly organizationId: string;
  readonly branchId?: string | null;
  readonly email: string;
  readonly inviterUserId: string;
  readonly tokenHash: string;
  readonly scope: MembershipInvitationScope;
  readonly expiresAt: Date;
}

// Data used to reconstruct an existing MembershipInvitation.
export interface MembershipInvitationProps {
  readonly id: string;
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly email: string;
  readonly inviterUserId: string;
  readonly tokenHash: string;
  readonly scope: MembershipInvitationScope;
  readonly status: MembershipInvitationStatus;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Internal state of the MembershipInvitation entity.
interface MembershipInvitationState {
  readonly id: UniqueId;
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly email: string;
  readonly inviterUserId: string;
  readonly tokenHash: string;
  readonly scope: MembershipInvitationScope;
  status: MembershipInvitationStatus;
  readonly expiresAt: Date;
  acceptedAt: Date | null;
  readonly createdAt: Date;
  updatedAt: Date;
}

export class MembershipInvitation extends Entity<UniqueId> {
  private readonly _organizationId: string;
  private readonly _branchId: string | null;
  private readonly _email: string;
  private readonly _inviterUserId: string;
  private readonly _tokenHash: string;
  private readonly _scope: MembershipInvitationScope;

  private _status: MembershipInvitationStatus;
  private readonly _expiresAt: Date;
  private _acceptedAt: Date | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: MembershipInvitationState) {
    super(props.id);

    this._organizationId = props.organizationId;
    this._branchId = props.branchId;
    this._email = props.email;
    this._inviterUserId = props.inviterUserId;
    this._tokenHash = props.tokenHash;
    this._scope = props.scope;
    this._status = props.status;
    this._expiresAt = new Date(props.expiresAt);
    this._acceptedAt = props.acceptedAt ? new Date(props.acceptedAt) : null;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // --------------------------------------------------
  // FACTORY METHODS
  // --------------------------------------------------

  // Factory method: creates a new MembershipInvitation.
  static create(input: CreateMembershipInvitationInput): MembershipInvitation {
    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.ID_REQUIRED,
        'Membership invitation ID is required.',
      );
    }

    const organizationId = input.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Membership invitation organization ID is required.',
      );
    }

    const branchId = input.branchId?.trim() || null;

    const email = input.email.trim().toLowerCase();

    if (email.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_REQUIRED,
        'Membership invitation email is required.',
      );
    }

    if (!this.isValidEmail(email)) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        'Membership invitation email is invalid.',
      );
    }

    const inviterUserId = input.inviterUserId.trim();

    if (inviterUserId.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.INVITER_USER_ID_REQUIRED,
        'Membership invitation inviter user ID is required.',
      );
    }

    const tokenHash = input.tokenHash.trim();

    if (tokenHash.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.TOKEN_HASH_REQUIRED,
        'Membership invitation token hash is required.',
      );
    }

    if (!this.isValidScope(input.scope)) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.SCOPE_INVALID,
        'Membership invitation scope is invalid.',
      );
    }

    this.validateScopeAndBranch(input.scope, branchId);

    if (!this.isValidDate(input.expiresAt)) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.EXPIRES_AT_INVALID,
        'Membership invitation expiration date is invalid.',
      );
    }

    const now = new Date();

    if (input.expiresAt.getTime() <= now.getTime()) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.EXPIRES_AT_NOT_FUTURE,
        'Membership invitation expiration date must be in the future.',
      );
    }

    return new MembershipInvitation({
      id: new UniqueId(id),
      organizationId,
      branchId,
      email,
      inviterUserId,
      tokenHash,
      scope: input.scope,
      status: MEMBERSHIP_INVITATION_STATUS.PENDING,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Reconstitution method: restores an existing MembershipInvitation.
  static reconstitute(props: MembershipInvitationProps): MembershipInvitation {
    const id = props.id.trim();

    if (id.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.ID_REQUIRED,
        'Membership invitation ID is required.',
      );
    }

    const organizationId = props.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Membership invitation organization ID is required.',
      );
    }

    const branchId = props.branchId?.trim() || null;

    const email = props.email.trim().toLowerCase();

    if (email.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_REQUIRED,
        'Membership invitation email is required.',
      );
    }

    if (!this.isValidEmail(email)) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        'Membership invitation email is invalid.',
      );
    }

    const inviterUserId = props.inviterUserId.trim();

    if (inviterUserId.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.INVITER_USER_ID_REQUIRED,
        'Membership invitation inviter user ID is required.',
      );
    }

    const tokenHash = props.tokenHash.trim();

    if (tokenHash.length === 0) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.TOKEN_HASH_REQUIRED,
        'Membership invitation token hash is required.',
      );
    }

    if (!this.isValidScope(props.scope)) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.SCOPE_INVALID,
        'Membership invitation scope is invalid.',
      );
    }

    this.validateScopeAndBranch(props.scope, branchId);

    if (!this.isValidStatus(props.status)) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.STATUS_INVALID,
        'Membership invitation status is invalid.',
      );
    }

    if (
      !this.hasValidTimestamps(
        props.createdAt,
        props.updatedAt,
        props.expiresAt,
        props.acceptedAt,
      )
    ) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    }

    if (
      props.status === MEMBERSHIP_INVITATION_STATUS.ACCEPTED &&
      props.acceptedAt === null
    ) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.ACCEPTED_AT_REQUIRED,
        'Accepted membership invitation must have an accepted date.',
      );
    }

    if (
      props.status !== MEMBERSHIP_INVITATION_STATUS.ACCEPTED &&
      props.acceptedAt !== null
    ) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.ACCEPTED_AT_NOT_ALLOWED,
        'Only accepted membership invitations can have an accepted date.',
      );
    }

    return new MembershipInvitation({
      id: new UniqueId(id),
      organizationId,
      branchId,
      email,
      inviterUserId,
      tokenHash,
      scope: props.scope,
      status: props.status,
      expiresAt: props.expiresAt,
      acceptedAt: props.acceptedAt,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  // --------------------------------------------------
  // PRIVATE VALIDATION METHODS
  // --------------------------------------------------

  private static isValidScope(scope: MembershipInvitationScope): boolean {
    return Object.values(MEMBERSHIP_INVITATION_SCOPE).some(
      (validScope) => validScope === scope,
    );
  }

  private static isValidStatus(status: MembershipInvitationStatus): boolean {
    return Object.values(MEMBERSHIP_INVITATION_STATUS).some(
      (validStatus) => validStatus === status,
    );
  }

  private static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private static isValidDate(date: Date): boolean {
    return date instanceof Date && !Number.isNaN(date.getTime());
  }

  private static validateScopeAndBranch(
    scope: MembershipInvitationScope,
    branchId: string | null,
  ): void {
    if (
      scope === MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION &&
      branchId !== null
    ) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_NOT_ALLOWED,
        'Organization invitation cannot have a branch ID.',
      );
    }

    if (scope === MEMBERSHIP_INVITATION_SCOPE.BRANCH && branchId === null) {
      throw new InvalidMembershipInvitationDataError(
        MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_REQUIRED,
        'Branch invitation requires a branch ID.',
      );
    }
  }

  private static hasValidTimestamps(
    createdAt: Date,
    updatedAt: Date,
    expiresAt: Date,
    acceptedAt: Date | null,
  ): boolean {
    if (
      !this.isValidDate(createdAt) ||
      !this.isValidDate(updatedAt) ||
      !this.isValidDate(expiresAt)
    ) {
      return false;
    }

    if (acceptedAt !== null && !this.isValidDate(acceptedAt)) {
      return false;
    }

    if (createdAt.getTime() > updatedAt.getTime()) {
      return false;
    }

    if (createdAt.getTime() >= expiresAt.getTime()) {
      return false;
    }

    if (acceptedAt !== null) {
      if (
        acceptedAt.getTime() < createdAt.getTime() ||
        acceptedAt.getTime() >= expiresAt.getTime() ||
        acceptedAt.getTime() > updatedAt.getTime()
      ) {
        return false;
      }
    }

    return true;
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

  get branchId(): string | null {
    return this._branchId;
  }

  get email(): string {
    return this._email;
  }

  get inviterUserId(): string {
    return this._inviterUserId;
  }

  get tokenHash(): string {
    return this._tokenHash;
  }

  get scope(): MembershipInvitationScope {
    return this._scope;
  }

  get status(): MembershipInvitationStatus {
    return this._status;
  }

  get expiresAt(): Date {
    return new Date(this._expiresAt);
  }

  get acceptedAt(): Date | null {
    return this._acceptedAt ? new Date(this._acceptedAt) : null;
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

  accept(): boolean {
    if (this._status !== MEMBERSHIP_INVITATION_STATUS.PENDING) {
      return false;
    }

    const now = new Date();

    if (this.hasReachedExpiration(now)) {
      return false;
    }

    this._status = MEMBERSHIP_INVITATION_STATUS.ACCEPTED;
    this._acceptedAt = now;
    this.touch();

    return true;
  }

  revoke(): boolean {
    if (this._status !== MEMBERSHIP_INVITATION_STATUS.PENDING) {
      return false;
    }

    const now = new Date();

    if (this.hasReachedExpiration(now)) {
      return false;
    }

    this._status = MEMBERSHIP_INVITATION_STATUS.REVOKED;
    this.touch();

    return true;
  }

  expire(): boolean {
    if (this._status !== MEMBERSHIP_INVITATION_STATUS.PENDING) {
      return false;
    }

    const now = new Date();

    if (!this.hasReachedExpiration(now)) {
      return false;
    }

    this._status = MEMBERSHIP_INVITATION_STATUS.EXPIRED;
    this.touch();

    return true;
  }

  isPending(): boolean {
    return this._status === MEMBERSHIP_INVITATION_STATUS.PENDING;
  }

  isAccepted(): boolean {
    return this._status === MEMBERSHIP_INVITATION_STATUS.ACCEPTED;
  }

  isRevoked(): boolean {
    return this._status === MEMBERSHIP_INVITATION_STATUS.REVOKED;
  }

  isExpired(): boolean {
    return this._status === MEMBERSHIP_INVITATION_STATUS.EXPIRED;
  }

  // --------------------------------------------------
  // PRIVATE METHODS
  // --------------------------------------------------

  private hasReachedExpiration(now: Date): boolean {
    return now.getTime() >= this._expiresAt.getTime();
  }

  private touch(): void {
    this._updatedAt = new Date();
  }
}
