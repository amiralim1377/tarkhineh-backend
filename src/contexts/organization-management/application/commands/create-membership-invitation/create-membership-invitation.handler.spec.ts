import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipInvitation } from '../../../domain/entities/membership-invitation.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../../domain/types/membership-invitation-scope.js';
import { CreateMembershipInvitationCommandHandler } from './create-membership-invitation.handler.js';
import { MEMBERSHIP_INVITATION_STATUS } from '../../../domain/types/membership-invitation-status.js';
import { Branch } from '../../../domain/entities/branch.js';
import { CreateMembershipInvitationCommand } from './create-membership-invitation.command.js';
import { MembershipInvitationAuthorizationPort } from '../../ports/membership-invitation-authorization.port.js';
import { OrganizationLookupPort } from '../../ports/organization-lookup.port.js';
import { BranchRepository } from '../../ports/branch.repository.js';
import {
  OrganizationManagementUnitOfWork,
  OrganizationManagementUnitOfWorkContext,
} from '../../ports/organization-management-unit-of-work.port.js';
import { SecureTokenFactory } from '../../../../../shared/application/ports/secure-token-factory.port.js';
import {
  BRANCH_STATUS,
  ORGANIZATION_STATUS,
} from '../../../contracts/lifecycle-status.contract.js';
import { MembershipInvitationCreationForbiddenError } from '../../errors/membership-invitation-creation-forbidden.error.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import { BranchInactiveError } from '../../errors/branch-inactive.error.js';
import { InvalidMembershipInvitationDataError } from '../../../domain/errors/invalid-membership-invitation.error.js';
import { MembershipInvitationAlreadyExistsError } from '../../errors/membership-invitation-already-exists.error.js';
import { BranchNotFoundError } from '../../errors/branch-not-found.error.js';

// ============================================================
// TEST CONSTANTS
// ============================================================

const ACTOR_USER_ID = 'actor-user-id';
const ORGANIZATION_ID = 'organization-id';
const BRANCH_ID = 'branch-id';

const ORGANIZATION_NAME = 'ترخینه';
const BRANCH_NAME = 'شعبه مرکزی';

const RAW_TOKEN = 'test-raw-secure-token';
const TOKEN_HASH = 'a'.repeat(64);

const EMAIL = 'employee@example.com';
const NORMALIZED_EMAIL = 'employee@example.com';

const EXPECTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================================
// MOCKS
// ============================================================

const canCreateMembershipInvitationMock = vi.fn();
const findStatusByIdMock = vi.fn();
const findBranchByIdMock = vi.fn();

const findPendingByOrganizationAndEmailMock = vi.fn();
const findPendingByBranchAndEmailMock = vi.fn();
const saveInvitationMock = vi.fn();
const updateInvitationMock = vi.fn();

const enqueueInvitationEmailMock = vi.fn();

const createSecureTokenMock = vi.fn();
const hashSecureTokenMock = vi.fn();

const authorizationMock = {
  canCreateMembershipInvitation: canCreateMembershipInvitationMock,
} as unknown as MembershipInvitationAuthorizationPort;

const organizationLookupMock = {
  findStatusById: findStatusByIdMock,
} as unknown as OrganizationLookupPort;

const branchRepositoryMock = {
  findById: findBranchByIdMock,
} as unknown as BranchRepository;

const membershipInvitationRepositoryMock = {
  findPendingByOrganizationAndEmail: findPendingByOrganizationAndEmailMock,
  findPendingByBranchAndEmail: findPendingByBranchAndEmailMock,
  save: saveInvitationMock,
  update: updateInvitationMock,
};

const membershipInvitationEmailMock = {
  enqueueInvitationEmail: enqueueInvitationEmailMock,
};

const unitOfWorkContext = {
  membershipInvitationRepository: membershipInvitationRepositoryMock,
  membershipInvitationEmail: membershipInvitationEmailMock,
} as unknown as OrganizationManagementUnitOfWorkContext;

type UnitOfWorkOperation = (
  context: OrganizationManagementUnitOfWorkContext,
) => Promise<unknown>;

const executeUnitOfWorkMock = vi.fn(
  async (operation: UnitOfWorkOperation): Promise<unknown> =>
    operation(unitOfWorkContext),
);

const unitOfWorkMock = {
  execute: executeUnitOfWorkMock,
} as unknown as OrganizationManagementUnitOfWork;

const secureTokenFactoryMock = {
  create: createSecureTokenMock,
  hash: hashSecureTokenMock,
} as unknown as SecureTokenFactory;

// ============================================================
// FIXTURES
// ============================================================

function createOrganizationCommand(
  email = EMAIL,
): CreateMembershipInvitationCommand {
  return new CreateMembershipInvitationCommand(ACTOR_USER_ID, ORGANIZATION_ID, {
    email,
    scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
  });
}

function createBranchCommand(email = EMAIL): CreateMembershipInvitationCommand {
  return new CreateMembershipInvitationCommand(ACTOR_USER_ID, ORGANIZATION_ID, {
    email,
    scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
    branchId: BRANCH_ID,
  });
}

function createBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    nameFa: BRANCH_NAME,
    status: BRANCH_STATUS.ACTIVE,
    ...overrides,
  } as Branch;
}

function createExistingInvitation(expireResult: boolean): MembershipInvitation {
  return {
    expire: vi.fn().mockReturnValue(expireResult),
    status: MEMBERSHIP_INVITATION_STATUS.PENDING,
  } as unknown as MembershipInvitation;
}

function createDependencyError(message: string): Error {
  return new Error(message);
}

function createSut(): CreateMembershipInvitationCommandHandler {
  return new CreateMembershipInvitationCommandHandler(
    authorizationMock,
    organizationLookupMock,
    branchRepositoryMock,
    unitOfWorkMock,
    secureTokenFactoryMock,
  );
}

// ============================================================
// TEST SUITE
// ============================================================

describe('CreateMembershipInvitationCommandHandler', () => {
  let sut: CreateMembershipInvitationCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    // Authorization
    canCreateMembershipInvitationMock.mockResolvedValue(true);

    // Organization
    findStatusByIdMock.mockResolvedValue(ORGANIZATION_STATUS.ACTIVE);

    // Branch
    findBranchByIdMock.mockResolvedValue(createBranch());

    // Invitation Repository
    findPendingByOrganizationAndEmailMock.mockResolvedValue(null);
    findPendingByBranchAndEmailMock.mockResolvedValue(null);
    saveInvitationMock.mockResolvedValue(undefined);
    updateInvitationMock.mockResolvedValue(undefined);

    // Invitation Email
    enqueueInvitationEmailMock.mockResolvedValue(undefined);

    // Secure Token Factory
    createSecureTokenMock.mockReturnValue({
      rawToken: RAW_TOKEN,
      tokenHash: TOKEN_HASH,
    });
    hashSecureTokenMock.mockReturnValue(TOKEN_HASH);

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
    it('creates an organization membership invitation successfully', async () => {
      const result = await sut.execute(createOrganizationCommand());

      expect(result).toEqual({
        membershipInvitationId: expect.any(String),
      });

      expect(saveInvitationMock).toHaveBeenCalledTimes(1);
      expect(enqueueInvitationEmailMock).toHaveBeenCalledTimes(1);
      expect(executeUnitOfWorkMock).toHaveBeenCalledTimes(1);
    });

    it('normalizes the email before creating the invitation', async () => {
      await sut.execute(createOrganizationCommand('  Employee@Example.COM  '));

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;

      expect(savedInvitation.email).toBe(NORMALIZED_EMAIL);

      expect(enqueueInvitationEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: NORMALIZED_EMAIL,
        }),
      );
    });

    it('checks organization authorization with the correct input', async () => {
      await sut.execute(createOrganizationCommand());

      expect(canCreateMembershipInvitationMock).toHaveBeenCalledWith({
        actorUserId: ACTOR_USER_ID,
        organizationId: ORGANIZATION_ID,
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
      });
    });

    it('does not look up a branch for an organization invitation', async () => {
      await sut.execute(createOrganizationCommand());

      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(findPendingByBranchAndEmailMock).not.toHaveBeenCalled();
      expect(findPendingByOrganizationAndEmailMock).toHaveBeenCalledTimes(1);
    });

    it('creates the invitation with the token hash returned by SecureTokenFactory', async () => {
      await sut.execute(createOrganizationCommand());

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;

      expect(savedInvitation.tokenHash).toBe(TOKEN_HASH);
      expect(savedInvitation.email).toBe(NORMALIZED_EMAIL);
      expect(savedInvitation.organizationId).toBe(ORGANIZATION_ID);
      expect(savedInvitation.inviterUserId).toBe(ACTOR_USER_ID);

      expect(createSecureTokenMock).toHaveBeenCalledWith({
        byteLength: 32,
      });

      expect(hashSecureTokenMock).not.toHaveBeenCalled();
    });

    it('does not store the raw token in the membership invitation', async () => {
      await sut.execute(createOrganizationCommand());

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;

      expect(savedInvitation.tokenHash).toBe(TOKEN_HASH);
      expect(savedInvitation.tokenHash).not.toBe(RAW_TOKEN);
      expect(savedInvitation).not.toHaveProperty('rawToken');
    });

    it('sends the raw token to the invitation email port', async () => {
      await sut.execute(createOrganizationCommand());

      expect(enqueueInvitationEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          rawToken: RAW_TOKEN,
          invitationId: expect.any(String),
          email: NORMALIZED_EMAIL,
          scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
          organizationName: ORGANIZATION_NAME,
        }),
      );
    });

    it('uses the same invitation ID for persistence and email enqueue', async () => {
      await sut.execute(createOrganizationCommand());

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;
      const emailInput = enqueueInvitationEmailMock.mock.calls[0]?.[0];

      expect(emailInput.invitationId).toBe(savedInvitation.id);
    });

    it('sets the invitation expiration date to seven days in the future', async () => {
      const beforeExecution = Date.now();

      await sut.execute(createOrganizationCommand());

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;

      const remainingTime =
        savedInvitation.expiresAt.getTime() - beforeExecution;

      expect(remainingTime).toBeGreaterThanOrEqual(EXPECTED_TTL_MS);
      expect(remainingTime).toBeLessThanOrEqual(EXPECTED_TTL_MS + 1000);
    });

    it('passes the invitation expiration date to the email port', async () => {
      await sut.execute(createOrganizationCommand());

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;
      const emailInput = enqueueInvitationEmailMock.mock.calls[0]?.[0];

      expect(emailInput.expiresAt.getTime()).toBe(
        savedInvitation.expiresAt.getTime(),
      );
    });
  });

  // ==========================================================
  // BRANCH INVITATION
  // ==========================================================

  describe('branch invitation', () => {
    it('creates a branch membership invitation successfully', async () => {
      const result = await sut.execute(createBranchCommand());

      expect(result.membershipInvitationId).toEqual(expect.any(String));

      expect(findBranchByIdMock).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        BRANCH_ID,
      );

      expect(findPendingByBranchAndEmailMock).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        BRANCH_ID,
        NORMALIZED_EMAIL,
      );

      expect(saveInvitationMock).toHaveBeenCalledTimes(1);
      expect(enqueueInvitationEmailMock).toHaveBeenCalledTimes(1);
    });

    it('checks authorization with the branch ID', async () => {
      await sut.execute(createBranchCommand());

      expect(canCreateMembershipInvitationMock).toHaveBeenCalledWith({
        actorUserId: ACTOR_USER_ID,
        organizationId: ORGANIZATION_ID,
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
        branchId: BRANCH_ID,
      });
    });

    it('creates the invitation with the correct branch ID', async () => {
      await sut.execute(createBranchCommand());

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;

      expect(savedInvitation.scope).toBe(MEMBERSHIP_INVITATION_SCOPE.BRANCH);

      expect(savedInvitation.branchId).toBe(BRANCH_ID);
    });

    it('includes the branch name in the invitation email', async () => {
      await sut.execute(createBranchCommand());

      expect(enqueueInvitationEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          branchName: BRANCH_NAME,
        }),
      );
    });

    it('uses the trimmed branch ID', async () => {
      const command = new CreateMembershipInvitationCommand(
        ACTOR_USER_ID,
        ORGANIZATION_ID,
        {
          email: EMAIL,
          scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
          branchId: `  ${BRANCH_ID}  `,
        },
      );

      await sut.execute(command);

      expect(canCreateMembershipInvitationMock).toHaveBeenCalledWith({
        actorUserId: ACTOR_USER_ID,
        organizationId: ORGANIZATION_ID,
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
        branchId: BRANCH_ID,
      });

      expect(findBranchByIdMock).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        BRANCH_ID,
      );

      const savedInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;

      expect(savedInvitation.branchId).toBe(BRANCH_ID);
    });
  });

  // ==========================================================
  // AUTHORIZATION FAILURES
  // ==========================================================

  describe('authorization failures', () => {
    it('throws MembershipInvitationCreationForbiddenError when organization invitation is forbidden', async () => {
      canCreateMembershipInvitationMock.mockResolvedValue(false);

      await expect(
        sut.execute(createOrganizationCommand()),
      ).rejects.toBeInstanceOf(MembershipInvitationCreationForbiddenError);

      expect(findStatusByIdMock).not.toHaveBeenCalled();
      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('throws MembershipInvitationCreationForbiddenError when branch invitation is forbidden', async () => {
      canCreateMembershipInvitationMock.mockResolvedValue(false);

      await expect(sut.execute(createBranchCommand())).rejects.toBeInstanceOf(
        MembershipInvitationCreationForbiddenError,
      );

      expect(findStatusByIdMock).not.toHaveBeenCalled();
      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('propagates authorization dependency errors', async () => {
      const expectedError = createDependencyError(
        'Authorization dependency unavailable.',
      );

      canCreateMembershipInvitationMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(findStatusByIdMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // ORGANIZATION VALIDATION FAILURES
  // ==========================================================

  describe('organization validation failures', () => {
    it('throws OrganizationNotFoundError when organization does not exist', async () => {
      findStatusByIdMock.mockResolvedValue(null);

      await expect(
        sut.execute(createOrganizationCommand()),
      ).rejects.toBeInstanceOf(OrganizationNotFoundError);

      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('throws OrganizationSuspendedError when organization is suspended', async () => {
      findStatusByIdMock.mockResolvedValue(ORGANIZATION_STATUS.SUSPENDED);

      await expect(
        sut.execute(createOrganizationCommand()),
      ).rejects.toBeInstanceOf(OrganizationSuspendedError);

      expect(findBranchByIdMock).not.toHaveBeenCalled();
      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('propagates organization lookup dependency errors', async () => {
      const expectedError = createDependencyError(
        'Organization lookup failed.',
      );

      findStatusByIdMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // BRANCH VALIDATION FAILURES
  // ==========================================================

  describe('branch validation failures', () => {
    it('throws BranchNotFoundError when branch does not exist', async () => {
      findBranchByIdMock.mockResolvedValue(null);

      await expect(sut.execute(createBranchCommand())).rejects.toBeInstanceOf(
        BranchNotFoundError,
      );

      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('includes organization ID and branch ID in BranchNotFoundError', async () => {
      findBranchByIdMock.mockResolvedValue(null);

      await expect(sut.execute(createBranchCommand())).rejects.toMatchObject({
        message: `Branch "${BRANCH_ID}" was not found in organization "${ORGANIZATION_ID}".`,
      });
    });

    it('throws BranchInactiveError when branch is inactive', async () => {
      findBranchByIdMock.mockResolvedValue(
        createBranch({
          status: BRANCH_STATUS.INACTIVE,
        }),
      );

      await expect(sut.execute(createBranchCommand())).rejects.toBeInstanceOf(
        BranchInactiveError,
      );

      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });

    it('propagates branch lookup dependency errors', async () => {
      const expectedError = createDependencyError(
        'Branch repository unavailable.',
      );

      findBranchByIdMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createBranchCommand())).rejects.toBe(
        expectedError,
      );

      expect(createSecureTokenMock).not.toHaveBeenCalled();
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // SECURE TOKEN FACTORY FAILURES
  // ==========================================================

  describe('secure token generation failures', () => {
    it('propagates SecureTokenFactory errors', async () => {
      const expectedError = createDependencyError(
        'Secure token generation failed.',
      );

      createSecureTokenMock.mockImplementation(() => {
        throw expectedError;
      });

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // DOMAIN VALIDATION FAILURES
  // ==========================================================

  describe('domain validation failures', () => {
    it('propagates InvalidMembershipInvitationDataError for invalid email', async () => {
      await expect(
        sut.execute(createOrganizationCommand('invalid-email')),
      ).rejects.toBeInstanceOf(InvalidMembershipInvitationDataError);

      expect(createSecureTokenMock).toHaveBeenCalledTimes(1);
      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('does not persist an invitation when its domain creation fails', async () => {
      await expect(
        sut.execute(createOrganizationCommand('')),
      ).rejects.toBeInstanceOf(InvalidMembershipInvitationDataError);

      expect(executeUnitOfWorkMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // EXISTING PENDING INVITATIONS
  // ==========================================================

  describe('existing pending invitations', () => {
    it('throws MembershipInvitationAlreadyExistsError when an existing invitation has not expired', async () => {
      const existingInvitation = createExistingInvitation(false);

      findPendingByOrganizationAndEmailMock.mockResolvedValue(
        existingInvitation,
      );

      await expect(
        sut.execute(createOrganizationCommand()),
      ).rejects.toBeInstanceOf(MembershipInvitationAlreadyExistsError);

      expect(existingInvitation.expire).toHaveBeenCalledTimes(1);
      expect(updateInvitationMock).not.toHaveBeenCalled();
      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('expires an old pending invitation before saving a new one', async () => {
      const existingInvitation = createExistingInvitation(true);

      findPendingByOrganizationAndEmailMock.mockResolvedValue(
        existingInvitation,
      );

      await sut.execute(createOrganizationCommand());

      expect(existingInvitation.expire).toHaveBeenCalledTimes(1);

      expect(updateInvitationMock).toHaveBeenCalledWith(existingInvitation);

      expect(saveInvitationMock).toHaveBeenCalledTimes(1);
      expect(enqueueInvitationEmailMock).toHaveBeenCalledTimes(1);

      expect(updateInvitationMock.mock.invocationCallOrder[0]).toBeLessThan(
        saveInvitationMock.mock.invocationCallOrder[0],
      );
    });

    it('performs the same pending invitation check for branch scope', async () => {
      const existingInvitation = createExistingInvitation(false);

      findPendingByBranchAndEmailMock.mockResolvedValue(existingInvitation);

      await expect(sut.execute(createBranchCommand())).rejects.toBeInstanceOf(
        MembershipInvitationAlreadyExistsError,
      );

      expect(findPendingByOrganizationAndEmailMock).not.toHaveBeenCalled();
      expect(existingInvitation.expire).toHaveBeenCalledTimes(1);
      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('propagates errors when checking for an existing organization invitation', async () => {
      const expectedError = createDependencyError(
        'Invitation repository lookup failed.',
      );

      findPendingByOrganizationAndEmailMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('propagates errors when checking for an existing branch invitation', async () => {
      const expectedError = createDependencyError(
        'Branch invitation lookup failed.',
      );

      findPendingByBranchAndEmailMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createBranchCommand())).rejects.toBe(
        expectedError,
      );

      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('does not save a new invitation when expiring the previous invitation fails', async () => {
      const expectedError = createDependencyError(
        'Could not expire existing invitation.',
      );

      const existingInvitation = {
        expire: vi.fn(() => {
          throw expectedError;
        }),
      } as unknown as MembershipInvitation;

      findPendingByOrganizationAndEmailMock.mockResolvedValue(
        existingInvitation,
      );

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(updateInvitationMock).not.toHaveBeenCalled();
      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('does not enqueue email when updating an expired invitation fails', async () => {
      const expectedError = createDependencyError(
        'Could not update expired invitation.',
      );

      const existingInvitation = createExistingInvitation(true);

      findPendingByOrganizationAndEmailMock.mockResolvedValue(
        existingInvitation,
      );

      updateInvitationMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(saveInvitationMock).not.toHaveBeenCalled();
      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // PERSISTENCE FAILURES
  // ==========================================================

  describe('persistence failures', () => {
    it('propagates MembershipInvitationAlreadyExistsError from repository save', async () => {
      const expectedError = new MembershipInvitationAlreadyExistsError();

      saveInvitationMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('propagates unexpected repository save errors', async () => {
      const expectedError = createDependencyError(
        'Could not persist membership invitation.',
      );

      saveInvitationMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(enqueueInvitationEmailMock).not.toHaveBeenCalled();
    });

    it('propagates email enqueue errors', async () => {
      const expectedError = createDependencyError(
        'Could not enqueue invitation email.',
      );

      enqueueInvitationEmailMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );

      expect(saveInvitationMock).toHaveBeenCalledTimes(1);
      expect(enqueueInvitationEmailMock).toHaveBeenCalledTimes(1);
    });

    it('propagates UnitOfWork execution errors', async () => {
      const expectedError = createDependencyError(
        'Transaction execution failed.',
      );

      executeUnitOfWorkMock.mockRejectedValue(expectedError);

      await expect(sut.execute(createOrganizationCommand())).rejects.toBe(
        expectedError,
      );
    });
  });

  // ==========================================================
  // TRANSACTION RETRY SAFETY
  // ==========================================================

  describe('transaction retry safety', () => {
    it('generates the secure token only once before UnitOfWork execution', async () => {
      executeUnitOfWorkMock.mockImplementation(
        async (operation: UnitOfWorkOperation) => {
          await operation(unitOfWorkContext);
          return operation(unitOfWorkContext);
        },
      );

      await sut.execute(createOrganizationCommand());

      expect(createSecureTokenMock).toHaveBeenCalledTimes(1);
      expect(saveInvitationMock).toHaveBeenCalledTimes(2);
      expect(enqueueInvitationEmailMock).toHaveBeenCalledTimes(2);
    });

    it('reuses the same invitation ID and raw token across transaction retries', async () => {
      executeUnitOfWorkMock.mockImplementation(
        async (operation: UnitOfWorkOperation) => {
          await operation(unitOfWorkContext);
          return operation(unitOfWorkContext);
        },
      );

      await sut.execute(createOrganizationCommand());

      const firstInvitation = saveInvitationMock.mock
        .calls[0]?.[0] as MembershipInvitation;
      const secondInvitation = saveInvitationMock.mock
        .calls[1]?.[0] as MembershipInvitation;

      const firstEmailInput = enqueueInvitationEmailMock.mock.calls[0]?.[0];
      const secondEmailInput = enqueueInvitationEmailMock.mock.calls[1]?.[0];

      expect(firstInvitation.id).toBe(secondInvitation.id);
      expect(firstInvitation.tokenHash).toBe(secondInvitation.tokenHash);

      expect(firstEmailInput.invitationId).toBe(secondEmailInput.invitationId);

      expect(firstEmailInput.rawToken).toBe(secondEmailInput.rawToken);
    });
  });
});
