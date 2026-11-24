import { describe, expect, it } from 'vitest';

import {
  InvalidMembershipInvitationDataError,
  MEMBERSHIP_INVITATION_ERROR_CODE,
  type MembershipInvitationDataErrorCode,
} from '../errors/invalid-membership-invitation.error.js';

import {
  MEMBERSHIP_INVITATION_SCOPE,
  type MembershipInvitationScope,
} from '../types/membership-invitation-scope.js';

import {
  MEMBERSHIP_INVITATION_STATUS,
  type MembershipInvitationStatus,
} from '../types/membership-invitation-status.js';

import {
  MembershipInvitation,
  type CreateMembershipInvitationInput,
  type MembershipInvitationProps,
} from './membership-invitation.js';

// --------------------------------------------------
// TEST HELPERS
// --------------------------------------------------

const makeValidInput = (
  overrides: Partial<CreateMembershipInvitationInput> = {},
): CreateMembershipInvitationInput => ({
  organizationId: 'org-123',
  branchId: null,
  email: 'employee@example.com',
  inviterUserId: 'user-123',
  tokenHash: 'hashed-token-123',
  scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  ...overrides,
});

const makeValidProps = (
  overrides: Partial<MembershipInvitationProps> = {},
): MembershipInvitationProps => {
  const now = Date.now();

  return {
    id: 'invitation-123',
    organizationId: 'org-123',
    branchId: null,
    email: 'employee@example.com',
    inviterUserId: 'user-123',
    tokenHash: 'hashed-token-123',
    scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
    status: MEMBERSHIP_INVITATION_STATUS.PENDING,
    expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdAt: new Date(now - 60_000),
    updatedAt: new Date(now - 30_000),
    ...overrides,
  };
};

const expectMembershipInvitationError = (
  action: () => unknown,
  code: MembershipInvitationDataErrorCode,
  message: string,
): void => {
  let actualError: unknown;

  try {
    action();
  } catch (error) {
    actualError = error;
  }

  expect(actualError).toBeInstanceOf(InvalidMembershipInvitationDataError);

  expect(actualError).toMatchObject({
    code,
    message,
  });
};

const createInvitation = (
  overrides: Partial<MembershipInvitationProps> = {},
): MembershipInvitation => {
  return MembershipInvitation.reconstitute(makeValidProps(overrides));
};

// --------------------------------------------------
// TEST SUITE
// --------------------------------------------------

describe('MembershipInvitation', () => {
  // --------------------------------------------------
  // CREATE
  // --------------------------------------------------

  describe('create', () => {
    it('should create an organization invitation successfully', () => {
      // arrange
      const validInput = makeValidInput();

      // act
      const actual = MembershipInvitation.create(validInput);

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual.id).toBeTruthy();
      expect(actual.organizationId).toBe(validInput.organizationId);
      expect(actual.branchId).toBeNull();
      expect(actual.email).toBe(validInput.email);
      expect(actual.inviterUserId).toBe(validInput.inviterUserId);
      expect(actual.tokenHash).toBe(validInput.tokenHash);
      expect(actual.scope).toBe(validInput.scope);

      expect(actual.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);

      expect(actual.expiresAt).toEqual(validInput.expiresAt);
      expect(actual.acceptedAt).toBeNull();
      expect(actual.createdAt).toBeInstanceOf(Date);
      expect(actual.updatedAt).toBeInstanceOf(Date);

      expect(actual.updatedAt.getTime()).toBe(actual.createdAt.getTime());
    });

    it('should create a branch invitation successfully', () => {
      // arrange
      const validBranchInput = makeValidInput({
        branchId: 'branch-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      });

      // act
      const actual = MembershipInvitation.create(validBranchInput);

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual.id).toBeTruthy();
      expect(actual.organizationId).toBe(validBranchInput.organizationId);
      expect(actual.branchId).toBe(validBranchInput.branchId);
      expect(actual.email).toBe(validBranchInput.email);
      expect(actual.inviterUserId).toBe(validBranchInput.inviterUserId);
      expect(actual.tokenHash).toBe(validBranchInput.tokenHash);
      expect(actual.scope).toBe(validBranchInput.scope);

      expect(actual.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);

      expect(actual.expiresAt).toEqual(validBranchInput.expiresAt);
      expect(actual.acceptedAt).toBeNull();

      expect(actual.createdAt).toBeInstanceOf(Date);
      expect(actual.updatedAt).toBeInstanceOf(Date);

      expect(actual.updatedAt.getTime()).toBe(actual.createdAt.getTime());
    });

    it('should generate an ID when ID is not provided', () => {
      // arrange
      const input = makeValidInput();

      // act
      const actual = MembershipInvitation.create(input);

      // assert
      expect(actual.id).toBeTruthy();
      expect(actual.id).not.toBeUndefined();
    });

    it('should use the provided ID when ID is supplied', () => {
      // arrange
      const input = makeValidInput({
        id: 'supplied-id',
      });

      // act
      const actual = MembershipInvitation.create(input);

      // assert
      expect(actual.id).toBe(input.id);
    });

    it('should throw an error when the provided ID is empty', () => {
      // arrange
      const input = makeValidInput({
        id: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.ID_REQUIRED,
        'Membership invitation ID is required.',
      );
    });

    it('should throw an error when organization ID is empty', () => {
      // arrange
      const input = makeValidInput({
        organizationId: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Membership invitation organization ID is required.',
      );
    });

    it('should throw an error when branch ID is missing for a branch invitation', () => {
      // arrange
      const input = makeValidInput({
        branchId: null,
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_REQUIRED,
        'Branch invitation requires a branch ID.',
      );
    });

    it('should throw an error when branch ID is provided for an organization invitation', () => {
      // arrange
      const input = makeValidInput({
        branchId: 'branch-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_NOT_ALLOWED,
        'Organization invitation cannot have a branch ID.',
      );
    });

    it('should normalize email to lowercase and trim whitespace', () => {
      // arrange
      const input = makeValidInput({
        email: '  Employee@Example.COM  ',
      });

      // act
      const actual = MembershipInvitation.create(input);

      // assert
      expect(actual.email).toBe('employee@example.com');
    });

    it('should throw an error when email is empty', () => {
      // arrange
      const input = makeValidInput({
        email: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_REQUIRED,
        'Membership invitation email is required.',
      );
    });

    it('should throw an error when email is invalid', () => {
      // arrange
      const input = makeValidInput({
        email: 'invalid-email',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        'Membership invitation email is invalid.',
      );
    });

    it('should throw an error when inviter user ID is empty', () => {
      // arrange
      const input = makeValidInput({
        inviterUserId: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.INVITER_USER_ID_REQUIRED,
        'Membership invitation inviter user ID is required.',
      );
    });

    it('should throw an error when token hash is empty', () => {
      // arrange
      const input = makeValidInput({
        tokenHash: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TOKEN_HASH_REQUIRED,
        'Membership invitation token hash is required.',
      );
    });

    it('should throw an error when invitation scope is invalid', () => {
      // arrange
      const input = makeValidInput({
        scope: 'INVALID_SCOPE' as MembershipInvitationScope,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.SCOPE_INVALID,
        'Membership invitation scope is invalid.',
      );
    });

    it('should throw an error when expiration date is invalid', () => {
      // arrange
      const input = makeValidInput({
        expiresAt: new Date('invalid-date'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.EXPIRES_AT_INVALID,
        'Membership invitation expiration date is invalid.',
      );
    });

    it('should throw an error when expiration date is not in the future', () => {
      // arrange
      const input = makeValidInput({
        expiresAt: new Date(Date.now() - 1_000),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.create(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.EXPIRES_AT_NOT_FUTURE,
        'Membership invitation expiration date must be in the future.',
      );
    });

    it('should initialize invitation status as PENDING', () => {
      // arrange
      const input = makeValidInput();

      // act
      const actual = MembershipInvitation.create(input);

      // assert
      expect(actual.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
    });

    it('should initialize acceptedAt as null', () => {
      // arrange
      const input = makeValidInput();

      // act
      const actual = MembershipInvitation.create(input);

      // assert
      expect(actual.acceptedAt).toBeNull();
    });

    it('should initialize createdAt and updatedAt with the same timestamp', () => {
      // arrange
      const input = makeValidInput();

      // act
      const actual = MembershipInvitation.create(input);

      // assert
      expect(actual.createdAt).toBeInstanceOf(Date);
      expect(actual.updatedAt).toBeInstanceOf(Date);

      expect(actual.createdAt.getTime()).toBe(actual.updatedAt.getTime());
    });
  });

  // --------------------------------------------------
  // RECONSTITUTE
  // --------------------------------------------------

  describe('reconstitute', () => {
    // --------------------------------------------------
    // SUCCESS SCENARIOS
    // --------------------------------------------------

    it('should reconstitute an organization invitation successfully', () => {
      // arrange
      const validProps = makeValidProps();

      // act
      const actual = MembershipInvitation.reconstitute(validProps);

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual.id).toBe(validProps.id);
      expect(actual.organizationId).toBe(validProps.organizationId);
      expect(actual.branchId).toBeNull();
      expect(actual.email).toBe(validProps.email);
      expect(actual.inviterUserId).toBe(validProps.inviterUserId);
      expect(actual.tokenHash).toBe(validProps.tokenHash);
      expect(actual.scope).toBe(MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION);
      expect(actual.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
    });

    it('should reconstitute a branch invitation successfully', () => {
      // arrange
      const branchProps = makeValidProps({
        branchId: 'branch-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      });

      // act
      const actual = MembershipInvitation.reconstitute(branchProps);

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual.id).toBe(branchProps.id);
      expect(actual.organizationId).toBe(branchProps.organizationId);
      expect(actual.branchId).toBe(branchProps.branchId);
      expect(actual.scope).toBe(MEMBERSHIP_INVITATION_SCOPE.BRANCH);
      expect(actual.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
    });

    // --------------------------------------------------
    // ID VALIDATION
    // --------------------------------------------------

    it('should throw an error when ID is empty', () => {
      // arrange
      const input = makeValidProps({
        id: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.ID_REQUIRED,
        'Membership invitation ID is required.',
      );
    });

    // --------------------------------------------------
    // ORGANIZATION VALIDATION
    // --------------------------------------------------

    it('should throw an error when organization ID is empty', () => {
      // arrange
      const input = makeValidProps({
        organizationId: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Membership invitation organization ID is required.',
      );
    });

    // --------------------------------------------------
    // BRANCH VALIDATION
    // --------------------------------------------------

    it('should throw an error when branch ID is missing for a branch invitation', () => {
      // arrange
      const input = makeValidProps({
        branchId: null,
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_REQUIRED,
        'Branch invitation requires a branch ID.',
      );
    });

    it('should throw an error when branch ID is provided for an organization invitation', () => {
      // arrange
      const input = makeValidProps({
        branchId: 'branch-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_NOT_ALLOWED,
        'Organization invitation cannot have a branch ID.',
      );
    });

    // --------------------------------------------------
    // EMAIL VALIDATION
    // --------------------------------------------------

    it('should throw an error when email is empty', () => {
      // arrange
      const input = makeValidProps({
        email: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_REQUIRED,
        'Membership invitation email is required.',
      );
    });

    it('should throw an error when email is invalid', () => {
      // arrange
      const input = makeValidProps({
        email: 'invalid-email',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        'Membership invitation email is invalid.',
      );
    });

    it('should normalize email to lowercase and trim whitespace', () => {
      // arrange
      const input = makeValidProps({
        email: '  Employee@Example.COM  ',
      });

      // act
      const actual = MembershipInvitation.reconstitute(input);

      // assert
      expect(actual.email).toBe('employee@example.com');
    });

    // --------------------------------------------------
    // INVITER VALIDATION
    // --------------------------------------------------

    it('should throw an error when inviter user ID is empty', () => {
      // arrange
      const input = makeValidProps({
        inviterUserId: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.INVITER_USER_ID_REQUIRED,
        'Membership invitation inviter user ID is required.',
      );
    });

    // --------------------------------------------------
    // TOKEN VALIDATION
    // --------------------------------------------------

    it('should throw an error when token hash is empty', () => {
      // arrange
      const input = makeValidProps({
        tokenHash: '  ',
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TOKEN_HASH_REQUIRED,
        'Membership invitation token hash is required.',
      );
    });

    // --------------------------------------------------
    // SCOPE VALIDATION
    // --------------------------------------------------

    it('should throw an error when invitation scope is invalid', () => {
      // arrange
      const input = makeValidProps({
        scope: 'INVALID_SCOPE' as MembershipInvitationScope,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.SCOPE_INVALID,
        'Membership invitation scope is invalid.',
      );
    });

    // --------------------------------------------------
    // STATUS VALIDATION
    // --------------------------------------------------

    it('should throw an error when invitation status is invalid', () => {
      // arrange
      const input = makeValidProps({
        status: 'INVALID_STATUS' as MembershipInvitationStatus,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.STATUS_INVALID,
        'Membership invitation status is invalid.',
      );
    });

    // --------------------------------------------------
    // DATE VALIDATION
    // --------------------------------------------------

    it('should throw an error when expiration date is invalid', () => {
      // arrange
      const input = makeValidProps({
        expiresAt: new Date('invalid-date'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when timestamps are invalid', () => {
      // arrange
      const input = makeValidProps({
        createdAt: new Date('invalid-date'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when updatedAt is before createdAt', () => {
      // arrange
      const input = makeValidProps({
        createdAt: new Date('2026-11-21T12:00:00.000Z'),
        updatedAt: new Date('2026-11-20T12:00:00.000Z'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when expiresAt is before or equal to createdAt', () => {
      // arrange
      const createdAt = new Date('2026-11-20T12:00:00.000Z');

      const input = makeValidProps({
        createdAt,
        updatedAt: new Date('2026-11-20T12:00:00.000Z'),
        expiresAt: new Date('2026-11-20T12:00:00.000Z'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when acceptedAt is invalid', () => {
      // arrange
      const now = Date.now();

      const input = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: new Date('invalid-date'),
        updatedAt: new Date(now - 10_000),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when acceptedAt is before createdAt', () => {
      // arrange
      const input = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: new Date('2026-11-19T12:00:00.000Z'),
        createdAt: new Date('2026-11-20T12:00:00.000Z'),
        updatedAt: new Date('2026-11-21T12:00:00.000Z'),
        expiresAt: new Date('2026-11-22T12:00:00.000Z'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when acceptedAt is after expiresAt', () => {
      // arrange
      const input = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        createdAt: new Date('2026-11-20T12:00:00.000Z'),
        acceptedAt: new Date('2026-11-23T12:00:00.000Z'),
        updatedAt: new Date('2026-11-24T12:00:00.000Z'),
        expiresAt: new Date('2026-11-22T12:00:00.000Z'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    it('should throw an error when acceptedAt is after updatedAt', () => {
      // arrange
      const input = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        createdAt: new Date('2026-11-20T12:00:00.000Z'),
        acceptedAt: new Date('2026-11-22T12:00:00.000Z'),
        updatedAt: new Date('2026-11-21T12:00:00.000Z'),
        expiresAt: new Date('2026-11-25T12:00:00.000Z'),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.TIMESTAMPS_INVALID,
        'Membership invitation timestamps are invalid.',
      );
    });

    // --------------------------------------------------
    // ACCEPTED AT VALIDATION
    // --------------------------------------------------

    it('should throw an error when accepted invitation has no acceptedAt', () => {
      // arrange
      const input = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: null,
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.ACCEPTED_AT_REQUIRED,
        'Accepted membership invitation must have an accepted date.',
      );
    });

    it('should throw an error when non-accepted invitation has acceptedAt', () => {
      // arrange
      const now = Date.now();

      const input = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.PENDING,
        acceptedAt: new Date(now - 20_000),
        updatedAt: new Date(now - 10_000),
      });

      // act & assert
      expectMembershipInvitationError(
        () => MembershipInvitation.reconstitute(input),
        MEMBERSHIP_INVITATION_ERROR_CODE.ACCEPTED_AT_NOT_ALLOWED,
        'Only accepted membership invitations can have an accepted date.',
      );
    });

    // --------------------------------------------------
    // PROPERTY PRESERVATION
    // --------------------------------------------------

    it('should preserve all invitation properties after reconstitution', () => {
      // arrange
      const validProps = makeValidProps();

      // act
      const actual = MembershipInvitation.reconstitute(validProps);

      // assert
      expect(actual.id).toBe(validProps.id);
      expect(actual.organizationId).toBe(validProps.organizationId);
      expect(actual.branchId).toBe(validProps.branchId);
      expect(actual.email).toBe(validProps.email);
      expect(actual.inviterUserId).toBe(validProps.inviterUserId);
      expect(actual.tokenHash).toBe(validProps.tokenHash);
      expect(actual.scope).toBe(validProps.scope);
      expect(actual.status).toBe(validProps.status);
      expect(actual.expiresAt).toEqual(validProps.expiresAt);
      expect(actual.acceptedAt).toBeNull();
      expect(actual.createdAt).toEqual(validProps.createdAt);
      expect(actual.updatedAt).toEqual(validProps.updatedAt);
    });
  });

  // --------------------------------------------------
  // DOMAIN BEHAVIORS
  // --------------------------------------------------

  describe('accept', () => {
    it('should accept a pending invitation successfully', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.accept();

      // assert
      expect(actual).toBe(true);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.ACCEPTED);
      expect(invitation.acceptedAt).toBeInstanceOf(Date);
    });

    it('should return false when invitation is already accepted', () => {
      // arrange
      const now = Date.now();

      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: new Date(now - 20_000),
        updatedAt: new Date(now - 10_000),
      });

      // act
      const actual = invitation.accept();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.ACCEPTED);
    });

    it('should return false when invitation is revoked', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.REVOKED,
      });

      // act
      const actual = invitation.accept();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.REVOKED);
    });

    it('should return false when invitation is expired', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.EXPIRED,
      });

      // act
      const actual = invitation.accept();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.EXPIRED);
    });

    it('should return false when invitation has reached its expiration time', () => {
      // arrange
      const invitation = createInvitation({
        expiresAt: new Date(Date.now() - 10_000),
      });

      // act
      const actual = invitation.accept();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
      expect(invitation.acceptedAt).toBeNull();
    });

    it('should set acceptedAt when invitation is accepted', () => {
      // arrange
      const invitation = createInvitation();
      const beforeAcceptance = Date.now();

      // act
      const actual = invitation.accept();

      const afterAcceptance = Date.now();

      // assert
      expect(actual).toBe(true);
      expect(invitation.acceptedAt).toBeInstanceOf(Date);

      expect(invitation.acceptedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeAcceptance,
      );

      expect(invitation.acceptedAt!.getTime()).toBeLessThanOrEqual(
        afterAcceptance,
      );
    });

    it('should update updatedAt when invitation is accepted', () => {
      // arrange
      const invitation = createInvitation();
      const previousUpdatedAt = invitation.updatedAt;

      // act
      const actual = invitation.accept();

      // assert
      expect(actual).toBe(true);
      expect(invitation.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });
  });

  describe('revoke', () => {
    it('should revoke a pending invitation successfully', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.revoke();

      // assert
      expect(actual).toBe(true);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.REVOKED);
    });

    it('should return false when invitation is already revoked', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.REVOKED,
      });

      // act
      const actual = invitation.revoke();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.REVOKED);
    });

    it('should return false when invitation is accepted', () => {
      // arrange
      const now = Date.now();

      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: new Date(now - 20_000),
        updatedAt: new Date(now - 10_000),
      });

      // act
      const actual = invitation.revoke();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.ACCEPTED);
    });

    it('should return false when invitation is expired', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.EXPIRED,
      });

      // act
      const actual = invitation.revoke();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.EXPIRED);
    });

    it('should return false when invitation has reached its expiration time', () => {
      // arrange
      const invitation = createInvitation({
        expiresAt: new Date(Date.now() - 10_000),
      });

      // act
      const actual = invitation.revoke();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
    });

    it('should preserve acceptedAt as null when invitation is revoked', () => {
      // arrange
      const invitation = createInvitation();

      // act
      invitation.revoke();

      // assert
      expect(invitation.acceptedAt).toBeNull();
    });

    it('should update updatedAt when invitation is revoked', () => {
      // arrange
      const invitation = createInvitation();
      const previousUpdatedAt = invitation.updatedAt;

      // act
      const actual = invitation.revoke();

      // assert
      expect(actual).toBe(true);
      expect(invitation.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });
  });

  describe('expire', () => {
    it('should expire a pending invitation successfully', () => {
      // arrange
      const invitation = createInvitation({
        expiresAt: new Date(Date.now() - 10_000),
      });

      // act
      const actual = invitation.expire();

      // assert
      expect(actual).toBe(true);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.EXPIRED);
    });

    it('should return false when invitation has not reached its expiration time', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.expire();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
    });

    it('should return false when invitation is already expired', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.EXPIRED,
      });

      // act
      const actual = invitation.expire();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.EXPIRED);
    });

    it('should return false when invitation is accepted', () => {
      // arrange
      const now = Date.now();

      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: new Date(now - 20_000),
        updatedAt: new Date(now - 10_000),
      });

      // act
      const actual = invitation.expire();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.ACCEPTED);
    });

    it('should return false when invitation is revoked', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.REVOKED,
      });

      // act
      const actual = invitation.expire();

      // assert
      expect(actual).toBe(false);
      expect(invitation.status).toBe(MEMBERSHIP_INVITATION_STATUS.REVOKED);
    });

    it('should update updatedAt when invitation is expired', () => {
      // arrange
      const invitation = createInvitation({
        expiresAt: new Date(Date.now() - 10_000),
      });

      const previousUpdatedAt = invitation.updatedAt;

      // act
      const actual = invitation.expire();

      // assert
      expect(actual).toBe(true);
      expect(invitation.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });
  });

  // --------------------------------------------------
  // STATUS CHECKS
  // --------------------------------------------------

  describe('isPending', () => {
    it('should return true when invitation status is PENDING', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.isPending();

      // assert
      expect(actual).toBe(true);
    });

    it('should return false when invitation status is not PENDING', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.REVOKED,
      });

      // act
      const actual = invitation.isPending();

      // assert
      expect(actual).toBe(false);
    });
  });

  describe('isAccepted', () => {
    it('should return true when invitation status is ACCEPTED', () => {
      // arrange
      const now = Date.now();

      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt: new Date(now - 20_000),
        updatedAt: new Date(now - 10_000),
      });

      // act
      const actual = invitation.isAccepted();

      // assert
      expect(actual).toBe(true);
    });

    it('should return false when invitation status is not ACCEPTED', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.isAccepted();

      // assert
      expect(actual).toBe(false);
    });
  });

  describe('isRevoked', () => {
    it('should return true when invitation status is REVOKED', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.REVOKED,
      });

      // act
      const actual = invitation.isRevoked();

      // assert
      expect(actual).toBe(true);
    });

    it('should return false when invitation status is not REVOKED', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.isRevoked();

      // assert
      expect(actual).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('should return true when invitation status is EXPIRED', () => {
      // arrange
      const invitation = createInvitation({
        status: MEMBERSHIP_INVITATION_STATUS.EXPIRED,
      });

      // act
      const actual = invitation.isExpired();

      // assert
      expect(actual).toBe(true);
    });

    it('should return false when invitation status is not EXPIRED', () => {
      // arrange
      const invitation = createInvitation();

      // act
      const actual = invitation.isExpired();

      // assert
      expect(actual).toBe(false);
    });
  });

  // --------------------------------------------------
  // GETTERS
  // --------------------------------------------------

  describe('getters', () => {
    it('should return invitation ID', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.id;

      // assert
      expect(actual).toBe(props.id);
    });

    it('should return organization ID', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.organizationId;

      // assert
      expect(actual).toBe(props.organizationId);
    });

    it('should return branch ID', () => {
      // arrange
      const props = makeValidProps({
        branchId: 'branch-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      });

      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.branchId;

      // assert
      expect(actual).toBe(props.branchId);
    });

    it('should return email', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.email;

      // assert
      expect(actual).toBe(props.email);
    });

    it('should return inviter user ID', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.inviterUserId;

      // assert
      expect(actual).toBe(props.inviterUserId);
    });

    it('should return token hash', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.tokenHash;

      // assert
      expect(actual).toBe(props.tokenHash);
    });

    it('should return invitation scope', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.scope;

      // assert
      expect(actual).toBe(props.scope);
    });

    it('should return invitation status', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.status;

      // assert
      expect(actual).toBe(props.status);
    });

    it('should return expiration date', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.expiresAt;

      // assert
      expect(actual).toEqual(props.expiresAt);
    });

    it('should return acceptedAt', () => {
      // arrange
      const now = Date.now();

      const acceptedAt = new Date(now - 20_000);

      const props = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt,
        updatedAt: new Date(now - 10_000),
      });

      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.acceptedAt;

      // assert
      expect(actual).toEqual(acceptedAt);
    });

    it('should return createdAt', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.createdAt;

      // assert
      expect(actual).toEqual(props.createdAt);
    });

    it('should return updatedAt', () => {
      // arrange
      const props = makeValidProps();
      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const actual = invitation.updatedAt;

      // assert
      expect(actual).toEqual(props.updatedAt);
    });

    it('should return defensive copies of date properties', () => {
      // arrange
      const now = Date.now();

      const acceptedAt = new Date(now - 20_000);

      const props = makeValidProps({
        status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
        acceptedAt,
        updatedAt: new Date(now - 10_000),
      });

      const invitation = MembershipInvitation.reconstitute(props);

      // act
      const expiresAt = invitation.expiresAt;
      const actualAcceptedAt = invitation.acceptedAt;
      const createdAt = invitation.createdAt;
      const updatedAt = invitation.updatedAt;

      expiresAt.setFullYear(2000);
      actualAcceptedAt!.setFullYear(2000);
      createdAt.setFullYear(2000);
      updatedAt.setFullYear(2000);

      // assert
      expect(invitation.expiresAt).toEqual(props.expiresAt);
      expect(invitation.acceptedAt).toEqual(props.acceptedAt);
      expect(invitation.createdAt).toEqual(props.createdAt);
      expect(invitation.updatedAt).toEqual(props.updatedAt);
    });
  });
});
