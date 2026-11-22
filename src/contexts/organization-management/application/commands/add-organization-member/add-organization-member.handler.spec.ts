import {
  MEMBERSHIP_STATUS,
  ORGANIZATION_STATUS,
} from '../../../contracts/lifecycle-status.contract.js';
import { OrganizationMembership } from '../../../domain/entities/organization-membership.js';
import { InvalidOrganizationMemberAdditionInputError } from '../../errors/invalid-organization-member-addition-input.error.js';
import { OrganizationMemberAdditionForbiddenError } from '../../errors/organization-member-addition-forbidden.error.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import { AddOrganizationMemberCommand } from './add-organization-member.command.js';
import { AddOrganizationMemberHandler } from './add-organization-member.handler.js';
import { OrganizationMemberUserNotFoundError } from '../../errors/organization-member-user-not-found.error.js';
import { OrganizationMemberUserNotActiveError } from '../../errors/organization-member-user-not-active.error.js';
import { OrganizationMembershipAlreadyExistsError } from '../../errors/organization-membership-already-exists.error.js';

describe('AddOrganizationMemberHandler', () => {
  const validCommand = new AddOrganizationMemberCommand(
    'actorUser-Id',
    'organization-Id',
    'memberUser-Id',
  );

  const organizationLookup = {
    findStatusById: vi.fn(),
  };

  const memberAdditionAuthorization = {
    canAddOrganizationMember: vi.fn(),
  };

  const userLookup = {
    findStatusById: vi.fn(),
  };

  const membershipRepository = {
    findByOrganizationAndUser: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  let handler: AddOrganizationMemberHandler;

  beforeEach(() => {
    vi.resetAllMocks();

    organizationLookup.findStatusById.mockResolvedValue(
      ORGANIZATION_STATUS.ACTIVE,
    );

    memberAdditionAuthorization.canAddOrganizationMember.mockResolvedValue(
      true,
    );

    userLookup.findStatusById.mockResolvedValue('ACTIVE');

    membershipRepository.findByOrganizationAndUser.mockResolvedValue(null);

    membershipRepository.save.mockResolvedValue(undefined);

    handler = new AddOrganizationMemberHandler(
      membershipRepository,
      organizationLookup,
      memberAdditionAuthorization,
      userLookup,
    );
  });

  it('should create a membership successfully and return membershipId', async () => {
    // act
    const result = await handler.execute(validCommand);

    // assert
    expect(result.organizationMembershipId).toBeTruthy();

    expect(membershipRepository.save).toHaveBeenCalledTimes(1);

    const savedMembership = membershipRepository.save.mock.calls[0]?.[0];

    expect(
      memberAdditionAuthorization.canAddOrganizationMember,
    ).toHaveBeenCalledWith({
      actorUserId: validCommand.actorUserId,
      organizationId: validCommand.organizationId,
    });

    expect(savedMembership).toBeInstanceOf(OrganizationMembership);

    expect(savedMembership?.id).toBe(result.organizationMembershipId);

    expect(savedMembership?.organizationId).toBe(validCommand.organizationId);

    expect(savedMembership?.userId).toBe(validCommand.memberUserId);

    expect(savedMembership?.status).toBe('ACTIVE');

    expect(membershipRepository.findByOrganizationAndUser).toHaveBeenCalledWith(
      validCommand.organizationId,
      validCommand.memberUserId,
    );

    expect(membershipRepository.save).toHaveBeenCalledTimes(1);

    expect(result.organizationMembershipId).toBeTruthy();
  });

  describe('input validation', () => {
    it('should throw when actor user ID is empty', async () => {
      const invalidInput = new AddOrganizationMemberCommand(
        ' ',
        'organization-Id',
        'memberUser-Id',
      );

      //   act & assert
      await expect(handler.execute(invalidInput)).rejects.toBeInstanceOf(
        InvalidOrganizationMemberAdditionInputError,
      );
      expect(organizationLookup.findStatusById).not.toHaveBeenCalled();
    });

    it('should throw when organization ID is empty', async () => {
      const invalidInput = new AddOrganizationMemberCommand(
        'actorUser-Id',
        ' ',
        'memberUser-Id',
      );

      //   act & assert
      await expect(handler.execute(invalidInput)).rejects.toBeInstanceOf(
        InvalidOrganizationMemberAdditionInputError,
      );
      expect(organizationLookup.findStatusById).not.toHaveBeenCalled();
    });

    it('should throw when member user ID is empty', async () => {
      const invalidInput = new AddOrganizationMemberCommand(
        'actorUser-Id',
        'organization-Id',
        ' ',
      );

      //   act & assert
      await expect(handler.execute(invalidInput)).rejects.toBeInstanceOf(
        InvalidOrganizationMemberAdditionInputError,
      );
      expect(organizationLookup.findStatusById).not.toHaveBeenCalled();
    });
  });

  describe('organization validation', () => {
    it('should throw when organization does not exist', async () => {
      organizationLookup.findStatusById.mockResolvedValue(null);

      //   act & assert
      await expect(handler.execute(validCommand)).rejects.toBeInstanceOf(
        OrganizationNotFoundError,
      );

      expect(
        memberAdditionAuthorization.canAddOrganizationMember,
      ).not.toHaveBeenCalled();
    });

    it('should throw when organization is suspended', async () => {
      // arrange
      organizationLookup.findStatusById.mockResolvedValue(
        ORGANIZATION_STATUS.SUSPENDED,
      );
      // act
      const execution = handler.execute(validCommand);

      //   act & assert
      await expect(execution).rejects.toBeInstanceOf(
        OrganizationSuspendedError,
      );
      await expect(execution).rejects.toMatchObject({
        organizationId: validCommand.organizationId,
      });

      expect(
        memberAdditionAuthorization.canAddOrganizationMember,
      ).not.toHaveBeenCalled();
    });
  });

  describe('authorization', () => {
    it('should throw when actor is not authorized to add organization members', async () => {
      // arrange
      memberAdditionAuthorization.canAddOrganizationMember.mockResolvedValue(
        false,
      );

      //   act & assert
      await expect(handler.execute(validCommand)).rejects.toBeInstanceOf(
        OrganizationMemberAdditionForbiddenError,
      );
    });
  });

  describe('user validation', () => {
    it('should throw when member user does not exist', async () => {
      // arrange
      userLookup.findStatusById.mockResolvedValue(null);
      //   act & assert
      await expect(handler.execute(validCommand)).rejects.toBeInstanceOf(
        OrganizationMemberUserNotFoundError,
      );
    });

    it('should throw when member user is not active', async () => {
      // arrange
      userLookup.findStatusById.mockResolvedValue('PENDING');
      //   act & assert
      await expect(handler.execute(validCommand)).rejects.toBeInstanceOf(
        OrganizationMemberUserNotActiveError,
      );

      expect(membershipRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('membership validation', () => {
    it('should throw when membership already exists', async () => {
      // arrange
      const existingMembership = OrganizationMembership.create({
        organizationId: validCommand.organizationId,
        userId: validCommand.memberUserId,
        status: MEMBERSHIP_STATUS.ACTIVE,
      });

      membershipRepository.findByOrganizationAndUser.mockResolvedValue(
        existingMembership,
      );

      //   act
      await expect(handler.execute(validCommand)).rejects.toBeInstanceOf(
        OrganizationMembershipAlreadyExistsError,
      );

      expect(membershipRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('should propagate errors when saving membership fails', async () => {
      // arrange
      const persistenceError = new Error('Database connection failed');

      membershipRepository.save.mockRejectedValue(persistenceError);
      // act & assert
      await expect(handler.execute(validCommand)).rejects.toBe(
        persistenceError,
      );

      expect(membershipRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
