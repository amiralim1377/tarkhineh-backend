import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddBranchMemberCommand } from './add-branch-member.command.js';
import { AddBranchMemberHandler } from './add-branch-member.handler.js';
import type { Branch } from '../../../domain/entities/branch.js';
import { OrganizationMembership } from '../../../domain/entities/organization-membership.js';
import { BranchMembership } from '../../../domain/entities/branch-membership.js';
import {
  MEMBERSHIP_STATUS,
  ORGANIZATION_STATUS,
} from '../../../contracts/lifecycle-status.contract.js';
import { InvalidOrganizationMemberAdditionInputError } from '../../errors/invalid-organization-member-addition-input.error.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import { OrganizationMemberUserNotFoundError } from '../../errors/organization-member-user-not-found.error.js';
import { OrganizationMemberUserNotActiveError } from '../../errors/organization-member-user-not-active.error.js';
import { OrganizationMembershipNotActiveError } from '../../errors/organization-membership-not-active.error.js';
import { BranchNotFoundError } from '../../errors/branch-not-found.error.js';
import { BranchInactiveError } from '../../errors/branch-inactive.error.js';
import { BranchMemberAdditionForbiddenError } from '../../errors/branch-member-addition-forbidden.error.js';
import { BranchMembershipAlreadyExistsError } from '../../errors/branch-membership-already-exists.error.js';
import type { OrganizationLookupPort } from '../../ports/organization-lookup.port.js';
import type { BranchRepository } from '../../ports/branch.repository.js';
import type { BranchMemberAdditionAuthorizationPort } from '../../ports/branch-member-addition-authorization.port.js';
import type { IdentityAccessUserLookup } from '../../../../identity-access/contracts/user-lookup.contract.js';
import type {
  BranchMemberAdditionUnitOfWork,
  BranchMemberAdditionUnitOfWorkContext,
} from '../../ports/branch-member-addition-unit-of-work.port.js';
import type { MembershipStatus } from '../../../domain/types/lifecycle-status.js';

// ============================================================
// TEST CONSTANTS
// ============================================================

const ACTOR_USER_ID = 'actor-user-123';
const ORGANIZATION_ID = 'organization-123';
const BRANCH_ID = 'branch-123';
const MEMBER_USER_ID = 'member-user-123';

const EXISTING_ORGANIZATION_MEMBERSHIP_ID = 'organization-membership-123';

// ============================================================
// MOCKS
// ============================================================

const findOrganizationStatusMock = vi.fn();
const findBranchByIdMock = vi.fn();
const canAddBranchMemberMock = vi.fn();
const findUserStatusMock = vi.fn();

const findOrganizationMembershipMock = vi.fn();
const saveOrganizationMembershipMock = vi.fn();

const findBranchMembershipMock = vi.fn();
const saveBranchMembershipMock = vi.fn();
const updateBranchMembershipMock = vi.fn();

const authorizationMock = {
  canAddBranchMember: canAddBranchMemberMock,
} as unknown as BranchMemberAdditionAuthorizationPort;

const organizationLookupMock = {
  findStatusById: findOrganizationStatusMock,
} as unknown as OrganizationLookupPort;

const branchRepositoryMock = {
  findById: findBranchByIdMock,
} as unknown as BranchRepository;

const userLookupMock = {
  findStatusById: findUserStatusMock,
} as unknown as IdentityAccessUserLookup;

const unitOfWorkContext = {
  organizationMembershipRepository: {
    findByOrganizationAndUser: findOrganizationMembershipMock,
    save: saveOrganizationMembershipMock,
  },
  branchMembershipRepository: {
    findByBranchAndOrganizationMembership: findBranchMembershipMock,
    save: saveBranchMembershipMock,
    update: updateBranchMembershipMock,
  },
} as unknown as BranchMemberAdditionUnitOfWorkContext;

type UnitOfWorkOperation = (
  context: BranchMemberAdditionUnitOfWorkContext,
) => Promise<unknown>;

const executeUnitOfWorkMock = vi.fn();

const unitOfWorkMock = {
  execute: executeUnitOfWorkMock,
} as unknown as BranchMemberAdditionUnitOfWork;

// ============================================================
// FIXTURES
// ============================================================

function createCommand(
  overrides: Partial<{
    actorUserId: string;
    organizationId: string;
    branchId: string;
    memberUserId: string;
  }> = {},
): AddBranchMemberCommand {
  return new AddBranchMemberCommand(
    overrides.actorUserId ?? ACTOR_USER_ID,
    overrides.organizationId ?? ORGANIZATION_ID,
    overrides.branchId ?? BRANCH_ID,
    overrides.memberUserId ?? MEMBER_USER_ID,
  );
}

function createBranch(active = true): Branch {
  return {
    isActive: vi.fn().mockReturnValue(active),
  } as unknown as Branch;
}

function createOrganizationMembership(
  status: MembershipStatus,
): OrganizationMembership {
  return OrganizationMembership.create({
    id: EXISTING_ORGANIZATION_MEMBERSHIP_ID,
    organizationId: ORGANIZATION_ID,
    userId: MEMBER_USER_ID,
    status,
  });
}

function createBranchMembership(
  status: MembershipStatus = MEMBERSHIP_STATUS.ACTIVE,
): BranchMembership {
  return BranchMembership.create({
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_ID,
    organizationMembershipId: EXISTING_ORGANIZATION_MEMBERSHIP_ID,
    status,
  });
}

function createDependencyError(message: string): Error {
  return new Error(message);
}

function createSut(): AddBranchMemberHandler {
  return new AddBranchMemberHandler(
    organizationLookupMock,
    branchRepositoryMock,
    authorizationMock,
    userLookupMock,
    unitOfWorkMock,
  );
}

// ============================================================
// TEST SUITE
// ============================================================

describe('AddBranchMemberHandler', () => {
  let sut: AddBranchMemberHandler;

  beforeEach(() => {
    vi.resetAllMocks();

    // Organization
    findOrganizationStatusMock.mockResolvedValue(ORGANIZATION_STATUS.ACTIVE);

    // Authorization
    canAddBranchMemberMock.mockResolvedValue(true);

    // User
    findUserStatusMock.mockResolvedValue('ACTIVE');

    // Branch
    findBranchByIdMock.mockResolvedValue(createBranch());

    // Organization Membership
    findOrganizationMembershipMock.mockResolvedValue(null);
    saveOrganizationMembershipMock.mockResolvedValue(undefined);

    // Branch Membership
    findBranchMembershipMock.mockResolvedValue(null);
    saveBranchMembershipMock.mockResolvedValue(undefined);
    updateBranchMembershipMock.mockResolvedValue(undefined);

    // Unit Of Work
    executeUnitOfWorkMock.mockImplementation(
      async (operation: UnitOfWorkOperation) => operation(unitOfWorkContext),
    );

    sut = createSut();
  });

  // ==========================================================
  // SUCCESSFUL EXECUTION
  // ==========================================================

  describe('successful execution', () => {
    it('should add a user to a branch successfully', async () => {
      // Arrange
      const command = createCommand();

      // Act
      const actual = await sut.execute(command);

      // Assert
      expect(actual.branchMembershipId).toBeTruthy();
      expect(executeUnitOfWorkMock).toHaveBeenCalledOnce();
      expect(saveOrganizationMembershipMock).toHaveBeenCalledOnce();
      expect(saveBranchMembershipMock).toHaveBeenCalledOnce();
    });

    it('should create an active organization membership when it does not exist', async () => {
      // Arrange
      findOrganizationMembershipMock.mockResolvedValue(null);

      // Act
      await sut.execute(createCommand());

      // Assert
      const membership = saveOrganizationMembershipMock.mock
        .calls[0]?.[0] as OrganizationMembership;

      expect(membership).toBeInstanceOf(OrganizationMembership);
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
      expect(membership.userId).toBe(MEMBER_USER_ID);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
      expect(saveOrganizationMembershipMock).toHaveBeenCalledOnce();
    });

    it('should create an active branch membership', async () => {
      // Arrange
      await sut.execute(createCommand());

      // Assert
      const membership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      expect(membership).toBeInstanceOf(BranchMembership);
      expect(membership.organizationId).toBe(ORGANIZATION_ID);
      expect(membership.branchId).toBe(BRANCH_ID);
      expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    });

    it('should use the created organization membership ID in branch membership', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      const organizationMembership = saveOrganizationMembershipMock.mock
        .calls[0]?.[0] as OrganizationMembership;

      const branchMembership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      expect(branchMembership.organizationMembershipId).toBe(
        organizationMembership.id,
      );
    });

    it('should return the created branch membership ID', async () => {
      // Act
      const result = await sut.execute(createCommand());

      // Assert
      const branchMembership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      expect(result).toEqual({
        branchMembershipId: branchMembership.id,
      });
    });

    it('should check the target organization', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      expect(findOrganizationStatusMock).toHaveBeenCalledOnce();
      expect(findOrganizationStatusMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    });

    it('should check user status', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      expect(findUserStatusMock).toHaveBeenCalledOnce();
      expect(findUserStatusMock).toHaveBeenCalledWith(MEMBER_USER_ID);
    });

    it('should check target branch', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      expect(findBranchByIdMock).toHaveBeenCalledOnce();
      expect(findBranchByIdMock).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        BRANCH_ID,
      );
    });

    it('should authorize the actor against the target branch', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      expect(canAddBranchMemberMock).toHaveBeenCalledOnce();
      expect(canAddBranchMemberMock).toHaveBeenCalledWith({
        actorUserId: ACTOR_USER_ID,
        organizationId: ORGANIZATION_ID,
        branchId: BRANCH_ID,
      });
    });
  });

  // ==========================================================
  // EXISTING ORGANIZATION MEMBERSHIP
  // ==========================================================

  describe('existing organization membership', () => {
    it('should reuse an existing active organization membership', async () => {
      // Arrange
      const existingMembership = createOrganizationMembership(
        MEMBERSHIP_STATUS.ACTIVE,
      );

      findOrganizationMembershipMock.mockResolvedValue(existingMembership);

      // Act
      await sut.execute(createCommand());

      // Assert
      expect(saveOrganizationMembershipMock).not.toHaveBeenCalled();

      const branchMembership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      expect(branchMembership.organizationMembershipId).toBe(
        existingMembership.id,
      );
    });

    it('should not create a duplicate organization membership', async () => {
      // Arrange
      findOrganizationMembershipMock.mockResolvedValue(
        createOrganizationMembership(MEMBERSHIP_STATUS.ACTIVE),
      );

      // Act
      await sut.execute(createCommand());

      // Assert
      expect(saveOrganizationMembershipMock).not.toHaveBeenCalled();
      expect(saveBranchMembershipMock).toHaveBeenCalledOnce();
    });

    it.each([
      MEMBERSHIP_STATUS.INVITED,
      MEMBERSHIP_STATUS.SUSPENDED,
      MEMBERSHIP_STATUS.REMOVED,
    ])(
      'should reject an organization membership with status %s',
      async (status) => {
        // Arrange
        findOrganizationMembershipMock.mockResolvedValue(
          createOrganizationMembership(status),
        );

        // Act & Assert
        await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
          OrganizationMembershipNotActiveError,
        );

        expect(saveOrganizationMembershipMock).not.toHaveBeenCalled();
        expect(saveBranchMembershipMock).not.toHaveBeenCalled();
      },
    );
  });

  // ==========================================================
  // INPUT VALIDATION
  // ==========================================================

  describe('input validation', () => {
    it('should reject an empty actor user ID', async () => {
      await expect(
        sut.execute(createCommand({ actorUserId: '   ' })),
      ).rejects.toBeInstanceOf(InvalidOrganizationMemberAdditionInputError);

      expect(findOrganizationStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should reject an empty organization ID', async () => {
      await expect(
        sut.execute(createCommand({ organizationId: '   ' })),
      ).rejects.toBeInstanceOf(InvalidOrganizationMemberAdditionInputError);

      expect(findOrganizationStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should reject an empty branch ID', async () => {
      await expect(
        sut.execute(createCommand({ branchId: '   ' })),
      ).rejects.toBeInstanceOf(InvalidOrganizationMemberAdditionInputError);

      expect(findOrganizationStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should reject an empty member user ID', async () => {
      await expect(
        sut.execute(createCommand({ memberUserId: '   ' })),
      ).rejects.toBeInstanceOf(InvalidOrganizationMemberAdditionInputError);

      expect(findOrganizationStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should trim all input identifiers', async () => {
      // Arrange
      const command = createCommand({
        actorUserId: `  ${ACTOR_USER_ID}  `,
        organizationId: `  ${ORGANIZATION_ID}  `,
        branchId: `  ${BRANCH_ID}  `,
        memberUserId: `  ${MEMBER_USER_ID}  `,
      });

      // Act
      await sut.execute(command);

      // Assert
      expect(findOrganizationStatusMock).toHaveBeenCalledWith(ORGANIZATION_ID);

      expect(canAddBranchMemberMock).toHaveBeenCalledWith({
        actorUserId: ACTOR_USER_ID,
        organizationId: ORGANIZATION_ID,
        branchId: BRANCH_ID,
      });

      expect(findUserStatusMock).toHaveBeenCalledWith(MEMBER_USER_ID);

      expect(findBranchByIdMock).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        BRANCH_ID,
      );
    });
  });

  // ==========================================================
  // ORGANIZATION VALIDATION
  // ==========================================================

  describe('organization validation', () => {
    it('should throw OrganizationNotFoundError when organization does not exist', async () => {
      // Arrange
      findOrganizationStatusMock.mockResolvedValue(null);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        OrganizationNotFoundError,
      );

      expect(canAddBranchMemberMock).not.toHaveBeenCalled();
      expect(findUserStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should throw OrganizationSuspendedError when organization is suspended', async () => {
      // Arrange
      findOrganizationStatusMock.mockResolvedValue(
        ORGANIZATION_STATUS.SUSPENDED,
      );

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        OrganizationSuspendedError,
      );

      expect(canAddBranchMemberMock).not.toHaveBeenCalled();
      expect(findUserStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should propagate organization lookup errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Organization lookup failed.',
      );

      findOrganizationStatusMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // AUTHORIZATION
  // ==========================================================

  describe('authorization', () => {
    it('should throw BranchMemberAdditionForbiddenError when permission is denied', async () => {
      // Arrange
      canAddBranchMemberMock.mockResolvedValue(false);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        BranchMemberAdditionForbiddenError,
      );

      expect(findUserStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should propagate authorization errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Authorization service unavailable.',
      );

      canAddBranchMemberMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(findUserStatusMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // USER VALIDATION
  // ==========================================================

  describe('user validation', () => {
    it('should throw OrganizationMemberUserNotFoundError when user does not exist', async () => {
      // Arrange
      findUserStatusMock.mockResolvedValue(null);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        OrganizationMemberUserNotFoundError,
      );

      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should throw OrganizationMemberUserNotActiveError when user is not active', async () => {
      // Arrange
      findUserStatusMock.mockResolvedValue('PENDING');

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        OrganizationMemberUserNotActiveError,
      );

      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should propagate user lookup errors', async () => {
      // Arrange
      const expectedError = createDependencyError('User lookup failed.');

      findUserStatusMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // BRANCH VALIDATION
  // ==========================================================

  describe('branch validation', () => {
    it('should throw BranchNotFoundError when branch does not exist', async () => {
      // Arrange
      findBranchByIdMock.mockResolvedValue(null);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        BranchNotFoundError,
      );

      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should include organization ID and branch ID in BranchNotFoundError', async () => {
      // Arrange
      findBranchByIdMock.mockResolvedValue(null);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toMatchObject({
        message: `Branch "${BRANCH_ID}" was not found in organization "${ORGANIZATION_ID}".`,
      });
    });

    it('should throw BranchInactiveError when branch is inactive', async () => {
      // Arrange
      findBranchByIdMock.mockResolvedValue(createBranch(false));

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        BranchInactiveError,
      );

      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('should propagate branch repository errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Branch repository unavailable.',
      );

      findBranchByIdMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // ORGANIZATION MEMBERSHIP PERSISTENCE
  // ==========================================================

  describe('organization membership persistence', () => {
    it('should propagate organization membership lookup errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Organization membership lookup failed.',
      );

      findOrganizationMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(saveOrganizationMembershipMock).not.toHaveBeenCalled();
      expect(saveBranchMembershipMock).not.toHaveBeenCalled();
    });

    it('should propagate organization membership save errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Organization membership save failed.',
      );

      saveOrganizationMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(saveBranchMembershipMock).not.toHaveBeenCalled();
    });

    it('should propagate OrganizationMembershipAlreadyExistsError from repository', async () => {
      // Arrange
      const { OrganizationMembershipAlreadyExistsError } =
        await import('../../errors/organization-membership-already-exists.error.js');

      const expectedError = new OrganizationMembershipAlreadyExistsError();

      saveOrganizationMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(saveBranchMembershipMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // BRANCH MEMBERSHIP PERSISTENCE
  // ==========================================================

  describe('branch membership persistence', () => {
    it('should check existing branch membership using organization, branch and organization membership IDs', async () => {
      // Arrange
      const organizationMembership = createOrganizationMembership(
        MEMBERSHIP_STATUS.ACTIVE,
      );

      findOrganizationMembershipMock.mockResolvedValue(organizationMembership);

      // Act
      await sut.execute(createCommand());

      // Assert
      expect(findBranchMembershipMock).toHaveBeenCalledOnce();
      expect(findBranchMembershipMock).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        BRANCH_ID,
        organizationMembership.id,
      );
    });

    it('should throw BranchMembershipAlreadyExistsError when branch membership already exists', async () => {
      // Arrange
      findOrganizationMembershipMock.mockResolvedValue(
        createOrganizationMembership(MEMBERSHIP_STATUS.ACTIVE),
      );

      findBranchMembershipMock.mockResolvedValue(createBranchMembership());

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBeInstanceOf(
        BranchMembershipAlreadyExistsError,
      );

      expect(saveBranchMembershipMock).not.toHaveBeenCalled();
    });

    it('should propagate branch membership lookup errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Branch membership lookup failed.',
      );

      findBranchMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(saveBranchMembershipMock).not.toHaveBeenCalled();
    });

    it('should propagate BranchMembershipAlreadyExistsError from repository save', async () => {
      // Arrange
      const expectedError = new BranchMembershipAlreadyExistsError();

      saveBranchMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);
    });

    it('should propagate unexpected branch membership save errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Branch membership save failed.',
      );

      saveBranchMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);
    });
  });

  // ==========================================================
  // UNIT OF WORK
  // ==========================================================

  describe('unit of work', () => {
    it('should execute membership operations through the UnitOfWork', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      expect(executeUnitOfWorkMock).toHaveBeenCalledOnce();
      expect(saveOrganizationMembershipMock).toHaveBeenCalledOnce();
      expect(saveBranchMembershipMock).toHaveBeenCalledOnce();
    });

    it('should propagate UnitOfWork execution errors', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Transaction execution failed.',
      );

      executeUnitOfWorkMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);
    });

    it('should not create a branch membership when organization membership save fails', async () => {
      // Arrange
      const expectedError = createDependencyError(
        'Organization membership could not be saved.',
      );

      saveOrganizationMembershipMock.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(sut.execute(createCommand())).rejects.toBe(expectedError);

      expect(saveBranchMembershipMock).not.toHaveBeenCalled();
    });

    it('should use the same organization membership ID during the entire operation', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      const organizationMembership = saveOrganizationMembershipMock.mock
        .calls[0]?.[0] as OrganizationMembership;

      const branchMembership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      expect(branchMembership.organizationMembershipId).toBe(
        organizationMembership.id,
      );
    });
  });

  // ==========================================================
  // RETRY SAFETY
  // ==========================================================

  describe('transaction retry safety', () => {
    it('should generate membership identifiers before transaction execution', async () => {
      // Act
      await sut.execute(createCommand());

      // Assert
      const organizationMembership = saveOrganizationMembershipMock.mock
        .calls[0]?.[0] as OrganizationMembership;

      const branchMembership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      expect(organizationMembership.id).toBeTruthy();
      expect(branchMembership.id).toBeTruthy();
    });

    it('should reuse the same membership identifiers when the transaction callback is retried', async () => {
      // Arrange
      executeUnitOfWorkMock.mockImplementation(
        async (operation: UnitOfWorkOperation) => {
          await operation(unitOfWorkContext);
          return operation(unitOfWorkContext);
        },
      );

      // Act
      await sut.execute(createCommand());

      // Assert
      expect(saveOrganizationMembershipMock).toHaveBeenCalledTimes(2);
      expect(saveBranchMembershipMock).toHaveBeenCalledTimes(2);

      const firstOrganizationMembership = saveOrganizationMembershipMock.mock
        .calls[0]?.[0] as OrganizationMembership;

      const secondOrganizationMembership = saveOrganizationMembershipMock.mock
        .calls[1]?.[0] as OrganizationMembership;

      const firstBranchMembership = saveBranchMembershipMock.mock
        .calls[0]?.[0] as BranchMembership;

      const secondBranchMembership = saveBranchMembershipMock.mock
        .calls[1]?.[0] as BranchMembership;

      expect(firstOrganizationMembership.id).toBe(
        secondOrganizationMembership.id,
      );

      expect(firstBranchMembership.id).toBe(secondBranchMembership.id);

      expect(firstBranchMembership.organizationMembershipId).toBe(
        secondBranchMembership.organizationMembershipId,
      );
    });
  });
});
