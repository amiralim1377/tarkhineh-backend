import { unknown } from 'zod';
import {
  InvalidMembershipInvitationDataError,
  MEMBERSHIP_INVITATION_ERROR_CODE,
} from '../errors/invalid-membership-invitation.error.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../types/membership-invitation-scope.js';
import { MEMBERSHIP_INVITATION_STATUS } from '../types/membership-invitation-status.js';
import {
  CreateMembershipInvitationInput,
  MembershipInvitation,
} from './membership-invitation.js';

describe('MembershipInvitation', () => {
  const validInput: CreateMembershipInvitationInput = {
    organizationId: 'org-123',
    branchId: null,
    email: 'employee@example.com',
    inviterUserId: 'user-123',
    tokenHash: 'hashed-token-123',
    scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  const validBranchInput: CreateMembershipInvitationInput = {
    organizationId: 'org-123',
    email: 'employee@example.com',
    inviterUserId: 'user-123',
    tokenHash: 'hashed-token-123',
    expiresAt: new Date('2026-11-23T13:46:12.793Z'),
    branchId: 'branch-123',
    scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
  };
  // --------------------------------------------------
  // CREATE
  // --------------------------------------------------

  describe('create', () => {
    it('should create an organization invitation successfully', () => {
      // arrange
      //   act
      const actual = MembershipInvitation.create(validInput);
      //   assert
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
      const validInput: CreateMembershipInvitationInput = {
        organizationId: 'org-123',
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        branchId: 'branch-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      };

      //   act
      const actual = MembershipInvitation.create(validBranchInput);
      //   assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual.id).toBeTruthy();
      expect(actual.organizationId).toBe(validInput.organizationId);
      expect(actual.branchId).toBe(validInput.branchId);
      expect(actual.email).toBe(validInput.email);
      expect(actual.inviterUserId).toBe(validInput.inviterUserId);
      expect(actual.tokenHash).toBe(validInput.tokenHash);
      expect(actual.scope).toBe(validInput.scope);
      expect(actual.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
      expect(actual.expiresAt).toEqual(validBranchInput.expiresAt);

      expect(actual.acceptedAt).toBeNull();
      expect(actual.createdAt).toBeInstanceOf(Date);
      expect(actual.updatedAt).toBeInstanceOf(Date);
      expect(actual.updatedAt.getTime()).toBe(actual.createdAt.getTime());
    });

    it('should generate an ID when ID is not provided', () => {
      const validInput: CreateMembershipInvitationInput = {
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      //   act
      const actual = MembershipInvitation.create(validInput);

      //   assert
      expect(actual.id).toBeDefined();
    });

    it('should use the provided ID when ID is supplied', () => {
      const validInput: CreateMembershipInvitationInput = {
        organizationId: 'org-123',
        id: 'supplied-id',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      //   act
      const actual = MembershipInvitation.create(validInput);
      //   assert
      expect(actual.id).toBe(validInput.id);
    });

    it('should throw an error when the provided ID is empty', () => {
      const validInput: CreateMembershipInvitationInput = {
        id: '  ',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // act
      let actualError: unknown;

      try {
        MembershipInvitation.create(validInput);
      } catch (error) {
        actualError = error;
      }

      //   act & assert
      expect(() => MembershipInvitation.create(validInput)).toThrow(
        InvalidMembershipInvitationDataError,
      );

      expect(actualError).toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.ID_REQUIRED,
        message: 'Membership invitation ID is required.',
      });
    });

    it('should throw an error when organization ID is empty', () => {
      const validInput: CreateMembershipInvitationInput = {
        organizationId: ' ',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      let actualError: unknown;

      try {
        MembershipInvitation.create(validInput);
      } catch (error) {
        actualError = error;
      }

      // assert
      expect(actualError).toBeInstanceOf(InvalidMembershipInvitationDataError);

      expect(actualError).toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        message: 'Membership invitation organization ID is required.',
      });
    });

    it('should throw an error when branch ID is missing for a branch invitation', () => {
      // arrange
      const validBranchInput: CreateMembershipInvitationInput = {
        organizationId: 'org-123',
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
      };

      // act
      let actualError: unknown;

      try {
        MembershipInvitation.create(validBranchInput);
      } catch (error) {
        actualError = error;
      }

      // assert
      expect(actualError).toBeInstanceOf(InvalidMembershipInvitationDataError);

      expect(actualError).toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.BRANCH_ID_REQUIRED,
        message: 'Branch invitation requires a branch ID.',
      });
    });

    it.todo(
      'should throw an error when branch ID is provided for an organization invitation',
    );

    it.todo('should normalize email to lowercase and trim whitespace');

    it.todo('should throw an error when email is empty');

    it.todo('should throw an error when email is invalid');

    it.todo('should throw an error when inviter user ID is empty');

    it.todo('should throw an error when token hash is empty');

    it.todo('should throw an error when invitation scope is invalid');

    it.todo('should throw an error when expiration date is invalid');

    it.todo('should throw an error when expiration date is not in the future');

    it.todo('should initialize invitation status as PENDING');

    it.todo('should initialize acceptedAt as null');

    it.todo('should initialize createdAt and updatedAt');
  });

  // --------------------------------------------------
  // RECONSTITUTE
  // --------------------------------------------------

  describe('reconstitute', () => {
    it.todo('should reconstitute an organization invitation successfully');

    it.todo('should reconstitute a branch invitation successfully');

    it.todo('should throw an error when ID is empty');

    it.todo('should throw an error when organization ID is empty');

    it.todo(
      'should throw an error when branch ID is missing for a branch invitation',
    );

    it.todo(
      'should throw an error when branch ID is provided for an organization invitation',
    );

    it.todo('should throw an error when email is empty');

    it.todo('should throw an error when email is invalid');

    it.todo('should throw an error when inviter user ID is empty');

    it.todo('should throw an error when token hash is empty');

    it.todo('should throw an error when invitation scope is invalid');

    it.todo('should throw an error when invitation status is invalid');

    it.todo('should throw an error when expiration date is invalid');

    it.todo('should throw an error when timestamps are invalid');

    it.todo('should throw an error when updatedAt is before createdAt');

    it.todo(
      'should throw an error when expiresAt is before or equal to createdAt',
    );

    it.todo('should throw an error when accepted invitation has no acceptedAt');

    it.todo(
      'should throw an error when non-accepted invitation has acceptedAt',
    );

    it.todo('should preserve all invitation properties after reconstitution');
  });

  // --------------------------------------------------
  // DOMAIN BEHAVIORS
  // --------------------------------------------------

  describe('accept', () => {
    it.todo('should accept a pending invitation successfully');

    it.todo('should return false when invitation is already accepted');

    it.todo('should return false when invitation is revoked');

    it.todo('should return false when invitation is expired');

    it.todo(
      'should return false when invitation has reached its expiration time',
    );

    it.todo('should set acceptedAt when invitation is accepted');

    it.todo('should update updatedAt when invitation is accepted');
  });

  describe('revoke', () => {
    it.todo('should revoke a pending invitation successfully');

    it.todo('should return false when invitation is already revoked');

    it.todo('should return false when invitation is accepted');

    it.todo('should return false when invitation is expired');

    it.todo(
      'should return false when invitation has reached its expiration time',
    );

    it.todo('should preserve acceptedAt as null when invitation is revoked');

    it.todo('should update updatedAt when invitation is revoked');
  });

  describe('expire', () => {
    it.todo('should expire a pending invitation successfully');

    it.todo(
      'should return false when invitation has not reached its expiration time',
    );

    it.todo('should return false when invitation is already expired');

    it.todo('should return false when invitation is accepted');

    it.todo('should return false when invitation is revoked');

    it.todo('should update updatedAt when invitation is expired');
  });

  // --------------------------------------------------
  // STATUS CHECKS
  // --------------------------------------------------

  describe('isPending', () => {
    it.todo('should return true when invitation status is PENDING');

    it.todo('should return false when invitation status is not PENDING');
  });

  describe('isAccepted', () => {
    it.todo('should return true when invitation status is ACCEPTED');

    it.todo('should return false when invitation status is not ACCEPTED');
  });

  describe('isRevoked', () => {
    it.todo('should return true when invitation status is REVOKED');

    it.todo('should return false when invitation status is not REVOKED');
  });

  describe('isExpired', () => {
    it.todo('should return true when invitation status is EXPIRED');

    it.todo('should return false when invitation status is not EXPIRED');
  });

  // --------------------------------------------------
  // GETTERS
  // --------------------------------------------------

  describe('getters', () => {
    it.todo('should return invitation ID');

    it.todo('should return organization ID');

    it.todo('should return branch ID');

    it.todo('should return email');

    it.todo('should return inviter user ID');

    it.todo('should return token hash');

    it.todo('should return invitation scope');

    it.todo('should return invitation status');

    it.todo('should return expiration date');

    it.todo('should return acceptedAt');

    it.todo('should return createdAt');

    it.todo('should return updatedAt');

    it.todo('should return defensive copies of date properties');
  });
});
