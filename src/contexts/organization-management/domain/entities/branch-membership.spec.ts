import { describe, expect, it } from 'vitest';
import {
  BranchMembership,
  type CreateBranchMembershipInput,
  type BranchMembershipProps,
} from './branch-membership.js';
import {
  MEMBERSHIP_STATUS,
  type MembershipStatus,
} from '../types/lifecycle-status.js';
import {
  BRANCH_MEMBERSHIP_ERROR_CODE,
  InvalidBranchMembershipDataError,
  type BranchMembershipErrorCode,
} from '../errors/invalid-branch-membership.error.js';

// ============================================================
// TEST CONSTANTS
// ============================================================

const ID = 'branch-membership-123';
const ORGANIZATION_ID = 'organization-123';
const BRANCH_ID = 'branch-123';
const ORGANIZATION_MEMBERSHIP_ID = 'organization-membership-123';

const CREATED_AT = new Date('2026-01-01T10:00:00.000Z');
const UPDATED_AT = new Date('2026-01-01T11:00:00.000Z');

// ============================================================
// FIXTURES
// ============================================================

function createInput(
  overrides: Partial<CreateBranchMembershipInput> = {},
): CreateBranchMembershipInput {
  return {
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_ID,
    organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
    ...overrides,
  };
}

function createProps(
  overrides: Partial<BranchMembershipProps> = {},
): BranchMembershipProps {
  return {
    id: ID,
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_ID,
    organizationMembershipId: ORGANIZATION_MEMBERSHIP_ID,
    status: MEMBERSHIP_STATUS.ACTIVE,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createMembership(
  overrides: Partial<CreateBranchMembershipInput> = {},
): BranchMembership {
  return BranchMembership.create(createInput(overrides));
}

function expectDomainError(
  operation: () => unknown,
  expectedCode: BranchMembershipErrorCode,
): void {
  try {
    operation();

    throw new Error('Expected InvalidBranchMembershipDataError.');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidBranchMembershipDataError);
    expect(error).toMatchObject({
      code: expectedCode,
    });
  }
}

// ============================================================
// TEST SUITE
// ============================================================

describe('BranchMembership', () => {
  // ==========================================================
  // CREATE
  // ==========================================================

  describe('create', () => {
    it('should create a branch membership successfully', () => {
      // Arrange
      const input = createInput();

      // Act
      const membership = BranchMembership.create(input);

      // Assert
      expect(membership).toBeInstanceOf(BranchMembership);
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
      expect(membership.branchId).toBe(BRANCH_ID);
      expect(membership.organizationMembershipId).toBe(
        ORGANIZATION_MEMBERSHIP_ID,
      );
    });

    it('should generate an ID when no ID is provided', () => {
      // Act
      const membership = createMembership();

      // Assert
      expect(membership.id).toBeTruthy();
      expect(membership.id.trim().length).toBeGreaterThan(0);
    });

    it('should use the provided ID', () => {
      // Act
      const membership = createMembership({
        id: ID,
      });

      // Assert
      expect(membership.id).toBe(ID);
    });

    it('should trim the provided ID', () => {
      // Act
      const membership = createMembership({
        id: `  ${ID}  `,
      });

      // Assert
      expect(membership.id).toBe(ID);
    });

    it('should trim organization ID', () => {
      // Act
      const membership = createMembership({
        organizationId: `  ${ORGANIZATION_ID}  `,
      });

      // Assert
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
    });

    it('should trim branch ID', () => {
      // Act
      const membership = createMembership({
        branchId: `  ${BRANCH_ID}  `,
      });

      // Assert
      expect(membership.branchId).toBe(BRANCH_ID);
    });

    it('should trim organization membership ID', () => {
      // Act
      const membership = createMembership({
        organizationMembershipId: `  ${ORGANIZATION_MEMBERSHIP_ID}  `,
      });

      // Assert
      expect(membership.organizationMembershipId).toBe(
        ORGANIZATION_MEMBERSHIP_ID,
      );
    });

    it('should default status to INVITED', () => {
      // Act
      const membership = createMembership();

      // Assert
      expect(membership.status).toBe(MEMBERSHIP_STATUS.INVITED);
      expect(membership.isInvited()).toBe(true);
    });

    it('should use the provided status', () => {
      // Act
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.ACTIVE,
      });

      // Assert
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    });

    it('should initialize createdAt and updatedAt', () => {
      // Act
      const membership = createMembership();

      // Assert
      expect(membership.createdAt).toBeInstanceOf(Date);
      expect(membership.updatedAt).toBeInstanceOf(Date);

      expect(membership.createdAt.getTime()).toBe(
        membership.updatedAt.getTime(),
      );
    });

    it('should throw when provided ID is empty', () => {
      expectDomainError(
        () => createMembership({ id: '   ' }),
        BRANCH_MEMBERSHIP_ERROR_CODE.ID_REQUIRED,
      );
    });

    it('should throw when organization ID is empty', () => {
      expectDomainError(
        () => createMembership({ organizationId: '   ' }),
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should throw when branch ID is empty', () => {
      expectDomainError(
        () => createMembership({ branchId: '   ' }),
        BRANCH_MEMBERSHIP_ERROR_CODE.BRANCH_ID_REQUIRED,
      );
    });

    it('should throw when organization membership ID is empty', () => {
      expectDomainError(
        () =>
          createMembership({
            organizationMembershipId: '   ',
          }),
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ID_REQUIRED,
      );
    });

    it('should throw when status is invalid', () => {
      expectDomainError(
        () =>
          createMembership({
            status: 'INVALID_STATUS' as MembershipStatus,
          }),
        BRANCH_MEMBERSHIP_ERROR_CODE.STATUS_INVALID,
      );
    });
  });

  // ==========================================================
  // RECONSTITUTE
  // ==========================================================

  describe('reconstitute', () => {
    it('should reconstitute an existing branch membership successfully', () => {
      // Arrange
      const props = createProps();

      // Act
      const membership = BranchMembership.reconstitute(props);

      // Assert
      expect(membership).toBeInstanceOf(BranchMembership);
      expect(membership.id).toBe(ID);
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
      expect(membership.branchId).toBe(BRANCH_ID);
      expect(membership.organizationMembershipId).toBe(
        ORGANIZATION_MEMBERSHIP_ID,
      );
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    });

    it('should trim persisted IDs', () => {
      // Arrange
      const props = createProps({
        id: `  ${ID}  `,
        organizationId: `  ${ORGANIZATION_ID}  `,
        branchId: `  ${BRANCH_ID}  `,
        organizationMembershipId: `  ${ORGANIZATION_MEMBERSHIP_ID}  `,
      });

      // Act
      const membership = BranchMembership.reconstitute(props);

      // Assert
      expect(membership.id).toBe(ID);
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
      expect(membership.branchId).toBe(BRANCH_ID);
      expect(membership.organizationMembershipId).toBe(
        ORGANIZATION_MEMBERSHIP_ID,
      );
    });

    it('should preserve persisted timestamps', () => {
      // Arrange
      const props = createProps();

      // Act
      const membership = BranchMembership.reconstitute(props);

      // Assert
      expect(membership.createdAt.getTime()).toBe(CREATED_AT.getTime());

      expect(membership.updatedAt.getTime()).toBe(UPDATED_AT.getTime());
    });

    it('should throw when persisted ID is empty', () => {
      expectDomainError(
        () => BranchMembership.reconstitute(createProps({ id: '   ' })),
        BRANCH_MEMBERSHIP_ERROR_CODE.ID_REQUIRED,
      );
    });

    it('should throw when persisted organization ID is empty', () => {
      expectDomainError(
        () =>
          BranchMembership.reconstitute(createProps({ organizationId: '   ' })),
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should throw when persisted branch ID is empty', () => {
      expectDomainError(
        () => BranchMembership.reconstitute(createProps({ branchId: '   ' })),
        BRANCH_MEMBERSHIP_ERROR_CODE.BRANCH_ID_REQUIRED,
      );
    });

    it('should throw when persisted organization membership ID is empty', () => {
      expectDomainError(
        () =>
          BranchMembership.reconstitute(
            createProps({
              organizationMembershipId: '   ',
            }),
          ),
        BRANCH_MEMBERSHIP_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ID_REQUIRED,
      );
    });

    it('should throw when persisted status is invalid', () => {
      expectDomainError(
        () =>
          BranchMembership.reconstitute(
            createProps({
              status: 'INVALID_STATUS' as MembershipStatus,
            }),
          ),
        BRANCH_MEMBERSHIP_ERROR_CODE.STATUS_INVALID,
      );
    });

    it('should throw when createdAt is invalid', () => {
      expectDomainError(
        () =>
          BranchMembership.reconstitute(
            createProps({
              createdAt: new Date('invalid'),
            }),
          ),
        BRANCH_MEMBERSHIP_ERROR_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should throw when updatedAt is invalid', () => {
      expectDomainError(
        () =>
          BranchMembership.reconstitute(
            createProps({
              updatedAt: new Date('invalid'),
            }),
          ),
        BRANCH_MEMBERSHIP_ERROR_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should throw when createdAt is later than updatedAt', () => {
      expectDomainError(
        () =>
          BranchMembership.reconstitute(
            createProps({
              createdAt: UPDATED_AT,
              updatedAt: CREATED_AT,
            }),
          ),
        BRANCH_MEMBERSHIP_ERROR_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should accept equal createdAt and updatedAt timestamps', () => {
      // Arrange
      const timestamp = new Date('2026-01-01T10:00:00.000Z');

      // Act
      const membership = BranchMembership.reconstitute(
        createProps({
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );

      // Assert
      expect(membership.createdAt.getTime()).toBe(timestamp.getTime());

      expect(membership.updatedAt.getTime()).toBe(timestamp.getTime());
    });
  });

  // ==========================================================
  // GETTERS
  // ==========================================================

  describe('getters', () => {
    it('should expose all membership properties', () => {
      // Arrange
      const membership = BranchMembership.reconstitute(createProps());

      // Assert
      expect(membership.id).toBe(ID);
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
      expect(membership.branchId).toBe(BRANCH_ID);
      expect(membership.organizationMembershipId).toBe(
        ORGANIZATION_MEMBERSHIP_ID,
      );
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    });

    it('should return defensive copies of createdAt and updatedAt', () => {
      // Arrange
      const membership = BranchMembership.reconstitute(createProps());

      const originalCreatedAt = membership.createdAt.getTime();
      const originalUpdatedAt = membership.updatedAt.getTime();

      // Act
      const createdAt = membership.createdAt;
      const updatedAt = membership.updatedAt;

      createdAt.setTime(0);
      updatedAt.setTime(0);

      // Assert
      expect(membership.createdAt.getTime()).toBe(originalCreatedAt);

      expect(membership.updatedAt.getTime()).toBe(originalUpdatedAt);
    });
  });

  // ==========================================================
  // ACTIVATE
  // ==========================================================

  describe('activate', () => {
    it('should activate an invited membership', () => {
      // Arrange
      const membership = createMembership();
      const previousUpdatedAt = membership.updatedAt.getTime();

      // Act
      const result = membership.activate();

      // Assert
      expect(result).toBe(true);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
      expect(membership.isActive()).toBe(true);
      expect(membership.updatedAt.getTime()).toBeGreaterThanOrEqual(
        previousUpdatedAt,
      );
    });

    it('should activate a suspended membership', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.SUSPENDED,
      });

      // Act
      const result = membership.activate();

      // Assert
      expect(result).toBe(true);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    });

    it('should return false when membership is already active', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.ACTIVE,
      });

      const previousUpdatedAt = membership.updatedAt.getTime();

      // Act
      const result = membership.activate();

      // Assert
      expect(result).toBe(false);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
      expect(membership.updatedAt.getTime()).toBe(previousUpdatedAt);
    });

    it('should not activate a removed membership', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.REMOVED,
      });

      // Act
      const result = membership.activate();

      // Assert
      expect(result).toBe(false);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.REMOVED);
    });
  });

  // ==========================================================
  // SUSPEND
  // ==========================================================

  describe('suspend', () => {
    it('should suspend an active membership', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.ACTIVE,
      });

      const previousUpdatedAt = membership.updatedAt.getTime();

      // Act
      const result = membership.suspend();

      // Assert
      expect(result).toBe(true);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.SUSPENDED);
      expect(membership.isSuspended()).toBe(true);
      expect(membership.updatedAt.getTime()).toBeGreaterThanOrEqual(
        previousUpdatedAt,
      );
    });

    it('should return false when membership is invited', () => {
      // Arrange
      const membership = createMembership();

      // Act
      const result = membership.suspend();

      // Assert
      expect(result).toBe(false);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.INVITED);
    });

    it('should return false when membership is already suspended', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.SUSPENDED,
      });

      const previousUpdatedAt = membership.updatedAt.getTime();

      // Act
      const result = membership.suspend();

      // Assert
      expect(result).toBe(false);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.SUSPENDED);
      expect(membership.updatedAt.getTime()).toBe(previousUpdatedAt);
    });

    it('should return false when membership is removed', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.REMOVED,
      });

      // Act
      const result = membership.suspend();

      // Assert
      expect(result).toBe(false);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.REMOVED);
    });
  });

  // ==========================================================
  // REMOVE
  // ==========================================================

  describe('remove', () => {
    it.each([
      MEMBERSHIP_STATUS.INVITED,
      MEMBERSHIP_STATUS.ACTIVE,
      MEMBERSHIP_STATUS.SUSPENDED,
    ])('should remove a membership with status %s', (status) => {
      // Arrange
      const membership = createMembership({ status });

      const previousUpdatedAt = membership.updatedAt.getTime();

      // Act
      const result = membership.remove();

      // Assert
      expect(result).toBe(true);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.REMOVED);
      expect(membership.isRemoved()).toBe(true);
      expect(membership.updatedAt.getTime()).toBeGreaterThanOrEqual(
        previousUpdatedAt,
      );
    });

    it('should return false when membership is already removed', () => {
      // Arrange
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.REMOVED,
      });

      const previousUpdatedAt = membership.updatedAt.getTime();

      // Act
      const result = membership.remove();

      // Assert
      expect(result).toBe(false);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.REMOVED);
      expect(membership.updatedAt.getTime()).toBe(previousUpdatedAt);
    });
  });

  // ==========================================================
  // STATUS CHECKS
  // ==========================================================

  describe('status checks', () => {
    it('should correctly identify an invited membership', () => {
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.INVITED,
      });

      expect(membership.isInvited()).toBe(true);
      expect(membership.isActive()).toBe(false);
      expect(membership.isSuspended()).toBe(false);
      expect(membership.isRemoved()).toBe(false);
    });

    it('should correctly identify an active membership', () => {
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.ACTIVE,
      });

      expect(membership.isInvited()).toBe(false);
      expect(membership.isActive()).toBe(true);
      expect(membership.isSuspended()).toBe(false);
      expect(membership.isRemoved()).toBe(false);
    });

    it('should correctly identify a suspended membership', () => {
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.SUSPENDED,
      });

      expect(membership.isInvited()).toBe(false);
      expect(membership.isActive()).toBe(false);
      expect(membership.isSuspended()).toBe(true);
      expect(membership.isRemoved()).toBe(false);
    });

    it('should correctly identify a removed membership', () => {
      const membership = createMembership({
        status: MEMBERSHIP_STATUS.REMOVED,
      });

      expect(membership.isInvited()).toBe(false);
      expect(membership.isActive()).toBe(false);
      expect(membership.isSuspended()).toBe(false);
      expect(membership.isRemoved()).toBe(true);
    });
  });
});
