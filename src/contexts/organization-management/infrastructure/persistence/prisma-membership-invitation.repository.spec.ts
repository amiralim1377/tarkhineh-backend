import { PrismaService } from '../../../../prisma/prisma.service.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../domain/types/membership-invitation-scope.js';
import { MEMBERSHIP_INVITATION_STATUS } from '../../domain/types/membership-invitation-status.js';
import { PrismaMembershipInvitationRepository } from './prisma-membership-invitation.repository.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipInvitation } from '../../domain/entities/membership-invitation.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';
import {
  InvalidMembershipInvitationDataError,
  MEMBERSHIP_INVITATION_ERROR_CODE,
} from '../../domain/errors/invalid-membership-invitation.error.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { MembershipInvitationAlreadyExistsError } from '../../application/errors/membership-invitation-already-exists.error.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from '../../application/errors/organization-management-application-error-code.js';

describe('PrismaMembershipInvitationRepository', () => {
  const prismaMock = {
    membershipInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  let repository: PrismaMembershipInvitationRepository;

  const now = new Date();

  const fakeInvitation = {
    id: 'invitation-123',
    tokenHash: 'hashed-token-123',
    organizationId: 'org-123',
    branchId: null,
    email: 'employee@example.com',
    inviterUserId: 'user-123',
    scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
    status: MEMBERSHIP_INVITATION_STATUS.PENDING,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdAt: new Date(now.getTime() - 60 * 1000),
    updatedAt: new Date(now.getTime() - 60 * 1000),
  };

  const fakeBranchInvitation = {
    ...fakeInvitation,
    branchId: 'branch-123',
    scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repository = new PrismaMembershipInvitationRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  // --------------------------------------------------
  // FIND BY ID
  // --------------------------------------------------

  describe('findById', () => {
    it('should find a membership invitation by ID and organization ID', async () => {
      // arrange
      const input = {
        organizationId: fakeInvitation.organizationId,
        invitationId: fakeInvitation.id,
      };

      prismaMock.membershipInvitation.findUnique.mockResolvedValue(
        fakeInvitation,
      );

      // act
      const actual = await repository.findById(
        input.organizationId,
        input.invitationId,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual?.id).toBe(fakeInvitation.id);
      expect(actual?.organizationId).toBe(fakeInvitation.organizationId);
      expect(actual?.email).toBe(fakeInvitation.email);

      expect(prismaMock.membershipInvitation.findUnique).toHaveBeenCalledWith({
        where: {
          id: input.invitationId,
          organizationId: input.organizationId,
        },
      });
    });

    it('should return null when membership invitation does not exist', async () => {
      // arrange
      const input = {
        organizationId: fakeInvitation.organizationId,
        invitationId: fakeInvitation.id,
      };

      prismaMock.membershipInvitation.findUnique.mockResolvedValue(null);

      //   act
      const actual = await repository.findById(
        input.organizationId,
        input.invitationId,
      );

      //   asseration
      expect(actual).toBeNull();
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const input = {
        organizationId: fakeInvitation.organizationId,
        invitationId: fakeInvitation.id,
      };
      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prismaMock.membershipInvitation.findUnique.mockRejectedValue(
        databaseError,
      );

      //   act & assert
      await expect(
        repository.findById(input.organizationId, input.invitationId),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during reconstitution', async () => {
      // arrange
      const invalidInvitation = {
        ...fakeInvitation,
        email: 'invalid-email',
      };

      prismaMock.membershipInvitation.findUnique.mockResolvedValue(
        invalidInvitation,
      );

      // act & assert
      await expect(
        repository.findById(fakeInvitation.organizationId, fakeInvitation.id),
      ).rejects.toBeInstanceOf(InvalidMembershipInvitationDataError);

      await expect(
        repository.findById(fakeInvitation.organizationId, fakeInvitation.id),
      ).rejects.toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        message: 'Membership invitation email is invalid.',
      });
    });
  });

  // --------------------------------------------------
  // FIND BY TOKEN HASH
  // --------------------------------------------------
  describe('findByTokenHash', () => {
    it('should find a membership invitation by token hash', async () => {
      // arrange
      prismaMock.membershipInvitation.findUnique.mockResolvedValue(
        fakeInvitation,
      );

      // act
      const actual = await repository.findByTokenHash(fakeInvitation.tokenHash);

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual?.id).toBe(fakeInvitation.id);
      expect(actual?.tokenHash).toBe(fakeInvitation.tokenHash);

      expect(prismaMock.membershipInvitation.findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: fakeInvitation.tokenHash,
        },
      });
    });

    it('should return null when membership invitation does not exist', async () => {
      // arrange
      const input = {
        tokenHash: fakeInvitation.tokenHash,
      };

      prismaMock.membershipInvitation.findUnique.mockResolvedValue(null);

      //   act
      const actual = await repository.findByTokenHash(input.tokenHash);

      //   asseration
      expect(actual).toBeNull();
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const input = {
        tokenHash: fakeInvitation.tokenHash,
      };
      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prismaMock.membershipInvitation.findUnique.mockRejectedValue(
        databaseError,
      );

      //   act & assert
      await expect(
        repository.findByTokenHash(input.tokenHash),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during reconstitution', async () => {
      // arrange
      const invalidInvitation = {
        ...fakeInvitation,
        status: 'invalid-status',
      };

      prismaMock.membershipInvitation.findUnique.mockResolvedValue(
        invalidInvitation,
      );

      // act & assert
      await expect(
        repository.findByTokenHash(fakeInvitation.tokenHash),
      ).rejects.toBeInstanceOf(InvalidMembershipInvitationDataError);

      await expect(
        repository.findByTokenHash(fakeInvitation.tokenHash),
      ).rejects.toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.STATUS_INVALID,
        message: 'Membership invitation status is invalid.',
      });
    });
  });
  // --------------------------------------------------
  // FIND PENDING BY BRANCH AND EMAIL
  // --------------------------------------------------

  describe('findPendingByBranchAndEmail', () => {
    it('should find a pending branch invitation successfully', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        branchId: 'branch-123',
        email: 'employee@example.com',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        fakeBranchInvitation,
      );

      // act
      const actual = await repository.findPendingByBranchAndEmail(
        input.organizationId,
        input.branchId,
        input.email,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual?.id).toBe(fakeBranchInvitation.id);
      expect(actual?.branchId).toBe(input.branchId);
      expect(actual?.scope).toBe(MEMBERSHIP_INVITATION_SCOPE.BRANCH);
      expect(actual?.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          email: input.email,
          scope: 'BRANCH',
          status: 'PENDING',
        },
      });
    });

    it('should return null when no pending branch invitation exists', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        branchId: 'branch-123',
        email: 'employee@example.com',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(null);

      // act
      const actual = await repository.findPendingByBranchAndEmail(
        input.organizationId,
        input.branchId,
        input.email,
      );

      // assert
      expect(actual).toBeNull();

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should normalize email before querying Prisma', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        branchId: 'branch-123',
        email: '  Employee@Example.COM  ',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        fakeBranchInvitation,
      );

      // act
      const actual = await repository.findPendingByBranchAndEmail(
        input.organizationId,
        input.branchId,
        input.email,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          email: 'employee@example.com',
          scope: 'BRANCH',
          status: 'PENDING',
        },
      });
    });

    it('should filter invitations by organization ID, branch ID, scope and status', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        branchId: 'branch-123',
        email: 'employee@example.com',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        fakeBranchInvitation,
      );

      // act
      await repository.findPendingByBranchAndEmail(
        input.organizationId,
        input.branchId,
        input.email,
      );

      // assert
      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          branchId: 'branch-123',
          email: 'employee@example.com',
          scope: 'BRANCH',
          status: 'PENDING',
        },
      });
    });

    it('should not exclude invitations based on expiration date', async () => {
      // arrange
      const now = new Date();

      const expiredBranchInvitation = {
        ...fakeBranchInvitation,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        expiredBranchInvitation,
      );

      // act
      const actual = await repository.findPendingByBranchAndEmail(
        expiredBranchInvitation.organizationId,
        expiredBranchInvitation.branchId!,
        expiredBranchInvitation.email,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual?.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
      expect(actual?.expiresAt).toEqual(expiredBranchInvitation.expiresAt);

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: expiredBranchInvitation.organizationId,
          branchId: expiredBranchInvitation.branchId,
          email: expiredBranchInvitation.email,
          scope: 'BRANCH',
          status: 'PENDING',
        },
      });
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prismaMock.membershipInvitation.findFirst.mockRejectedValue(
        databaseError,
      );

      // act & assert
      await expect(
        repository.findPendingByBranchAndEmail(
          'org-123',
          'branch-123',
          'employee@example.com',
        ),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during reconstitution', async () => {
      // arrange
      const invalidBranchInvitation = {
        ...fakeBranchInvitation,
        email: 'invalid-email',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        invalidBranchInvitation,
      );

      // act
      const result = repository.findPendingByBranchAndEmail(
        fakeBranchInvitation.organizationId,
        fakeBranchInvitation.branchId,
        fakeBranchInvitation.email,
      );

      // assert
      await expect(result).rejects.toBeInstanceOf(
        InvalidMembershipInvitationDataError,
      );

      await expect(result).rejects.toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        message: 'Membership invitation email is invalid.',
      });
    });
  });

  // --------------------------------------------------
  // FIND PENDING BY ORGANIZATION AND EMAIL
  // --------------------------------------------------

  describe('findPendingByOrganizationAndEmail', () => {
    it('should find a pending organization invitation successfully', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        email: 'employee@example.com',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        fakeInvitation,
      );

      // act
      const actual = await repository.findPendingByOrganizationAndEmail(
        input.organizationId,
        input.email,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual?.id).toBe(fakeInvitation.id);
      expect(actual?.organizationId).toBe(input.organizationId);
      expect(actual?.scope).toBe(MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION);
      expect(actual?.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: input.organizationId,
          email: input.email,
          scope: 'ORGANIZATION',
          status: 'PENDING',
        },
      });
    });

    it('should return null when no pending organization invitation exists', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        email: 'employee@example.com',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(null);

      // act
      const actual = await repository.findPendingByOrganizationAndEmail(
        input.organizationId,
        input.email,
      );

      // assert
      expect(actual).toBeNull();

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should normalize email before querying Prisma', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        email: '  Employee@Example.COM  ',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        fakeInvitation,
      );

      // act
      const actual = await repository.findPendingByOrganizationAndEmail(
        input.organizationId,
        input.email,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: input.organizationId,
          email: 'employee@example.com',
          scope: 'ORGANIZATION',
          status: 'PENDING',
        },
      });
    });

    it('should filter invitations by organization ID, scope and status', async () => {
      // arrange
      const input = {
        organizationId: 'org-123',
        email: 'employee@example.com',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        fakeInvitation,
      );

      // act
      await repository.findPendingByOrganizationAndEmail(
        input.organizationId,
        input.email,
      );

      // assert
      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          email: 'employee@example.com',
          scope: 'ORGANIZATION',
          status: 'PENDING',
        },
      });
    });

    it('should not exclude invitations based on expiration date', async () => {
      // arrange
      const now = new Date();

      const expiredInvitation = {
        ...fakeInvitation,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        expiredInvitation,
      );

      // act
      const actual = await repository.findPendingByOrganizationAndEmail(
        expiredInvitation.organizationId,
        expiredInvitation.email,
      );

      // assert
      expect(actual).toBeInstanceOf(MembershipInvitation);
      expect(actual?.status).toBe(MEMBERSHIP_INVITATION_STATUS.PENDING);
      expect(actual?.expiresAt).toEqual(expiredInvitation.expiresAt);

      expect(prismaMock.membershipInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: expiredInvitation.organizationId,
          email: expiredInvitation.email,
          scope: 'ORGANIZATION',
          status: 'PENDING',
        },
      });
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prismaMock.membershipInvitation.findFirst.mockRejectedValue(
        databaseError,
      );

      // act & assert
      await expect(
        repository.findPendingByOrganizationAndEmail(
          'org-123',
          'employee@example.com',
        ),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during reconstitution', async () => {
      // arrange
      const invalidInvitation = {
        ...fakeInvitation,
        email: 'invalid-email',
      };

      prismaMock.membershipInvitation.findFirst.mockResolvedValue(
        invalidInvitation,
      );

      // act
      const result = repository.findPendingByOrganizationAndEmail(
        fakeInvitation.organizationId,
        fakeInvitation.email,
      );

      // assert
      await expect(result).rejects.toBeInstanceOf(
        InvalidMembershipInvitationDataError,
      );

      await expect(result).rejects.toMatchObject({
        code: MEMBERSHIP_INVITATION_ERROR_CODE.EMAIL_INVALID,
        message: 'Membership invitation email is invalid.',
      });
    });
  });

  // --------------------------------------------------
  // SAVE
  // --------------------------------------------------

  describe('save', () => {
    it('should save an organization invitation successfully', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // act
      await repository.save(invitation);

      // assert
      expect(prismaMock.membershipInvitation.create).toHaveBeenCalledWith({
        data: {
          id: invitation.id,
          organizationId: invitation.organizationId,
          branchId: invitation.branchId,
          email: invitation.email,
          inviterUserId: invitation.inviterUserId,
          tokenHash: invitation.tokenHash,
          scope: invitation.scope,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          acceptedAt: invitation.acceptedAt,
          createdAt: invitation.createdAt,
          updatedAt: invitation.updatedAt,
        },
      });
    });

    it('should save a branch invitation successfully', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-456',
        organizationId: 'org-123',
        branchId: 'branch-123',
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-456',
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // act
      await repository.save(invitation);

      // assert
      expect(prismaMock.membershipInvitation.create).toHaveBeenCalledWith({
        data: {
          id: invitation.id,
          organizationId: invitation.organizationId,
          branchId: invitation.branchId,
          email: invitation.email,
          inviterUserId: invitation.inviterUserId,
          tokenHash: invitation.tokenHash,
          scope: invitation.scope,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          acceptedAt: invitation.acceptedAt,
          createdAt: invitation.createdAt,
          updatedAt: invitation.updatedAt,
        },
      });
    });

    it('should persist all membership invitation properties', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // act
      await repository.save(invitation);

      expect(prismaMock.membershipInvitation.create).toHaveBeenCalledWith({
        data: {
          id: invitation.id,
          organizationId: invitation.organizationId,
          branchId: invitation.branchId,
          email: invitation.email,
          inviterUserId: invitation.inviterUserId,
          tokenHash: invitation.tokenHash,
          scope: invitation.scope,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          acceptedAt: invitation.acceptedAt,
          createdAt: invitation.createdAt,
          updatedAt: invitation.updatedAt,
        },
      });
    });

    it('should throw MembershipInvitationAlreadyExistsError when organization pending invitation is duplicated', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.1',
          meta: {
            target: 'MembershipInvitation_pending_organization_email_key',
          },
        },
      );

      prismaMock.membershipInvitation.create.mockRejectedValue(prismaError);

      //   act
      await expect(repository.save(invitation)).rejects.toBeInstanceOf(
        MembershipInvitationAlreadyExistsError,
      );

      await expect(repository.save(invitation)).rejects.toMatchObject({
        code: ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.MEMBERSHIP_INVITATION_ALREADY_EXISTS,
        message:
          'A pending membership invitation already exists for this email and destination.',
      });
    });

    it('should throw MembershipInvitationAlreadyExistsError when branch pending invitation is duplicated', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: 'branch-123',
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.1',
          meta: {
            target: 'MembershipInvitation_pending_branch_email_key',
          },
        },
      );

      prismaMock.membershipInvitation.create.mockRejectedValue(prismaError);

      // act
      const result = repository.save(invitation);

      // assert
      await expect(result).rejects.toBeInstanceOf(
        MembershipInvitationAlreadyExistsError,
      );

      await expect(result).rejects.toMatchObject({
        code: ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.MEMBERSHIP_INVITATION_ALREADY_EXISTS,
        message:
          'A pending membership invitation already exists for this email and destination.',
      });
    });
  });
  // --------------------------------------------------
  // UPDATE
  // --------------------------------------------------

  describe('update', () => {
    it('should update a membership invitation successfully', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      invitation.accept();

      prismaMock.membershipInvitation.update.mockResolvedValue(fakeInvitation);

      // act
      await repository.update(invitation);

      // assert
      expect(prismaMock.membershipInvitation.update).toHaveBeenCalledTimes(1);

      expect(prismaMock.membershipInvitation.update).toHaveBeenCalledWith({
        where: {
          id: invitation.id,
          organizationId: invitation.organizationId,
        },
        data: {
          status: MEMBERSHIP_INVITATION_STATUS.ACCEPTED,
          acceptedAt: invitation.acceptedAt,
          updatedAt: invitation.updatedAt,
        },
      });
    });

    it('should update invitation status', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      invitation.revoke();

      // act
      await repository.update(invitation);

      // assert
      expect(prismaMock.membershipInvitation.update).toHaveBeenCalledWith({
        where: {
          id: invitation.id,
          organizationId: invitation.organizationId,
        },
        data: {
          status: MEMBERSHIP_INVITATION_STATUS.REVOKED,
          acceptedAt: null,
          updatedAt: invitation.updatedAt,
        },
      });
    });

    it('should update acceptedAt and updatedAt', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      invitation.accept();

      const expectedAcceptedAt = invitation.acceptedAt;
      const expectedUpdatedAt = invitation.updatedAt;

      // act
      await repository.update(invitation);

      // assert
      expect(prismaMock.membershipInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            acceptedAt: expectedAcceptedAt,
            updatedAt: expectedUpdatedAt,
          }),
        }),
      );
    });

    it('should update invitation using ID and organization ID', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // act
      await repository.update(invitation);

      // assert
      expect(prismaMock.membershipInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: invitation.id,
            organizationId: invitation.organizationId,
          },
        }),
      );
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prismaMock.membershipInvitation.update.mockRejectedValue(databaseError);

      // act & assert
      await expect(repository.update(invitation)).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
    });

    it('should propagate record not found errors', async () => {
      // arrange
      const invitation = MembershipInvitation.create({
        id: 'invitation-123',
        organizationId: 'org-123',
        branchId: null,
        email: 'employee@example.com',
        inviterUserId: 'user-123',
        tokenHash: 'hashed-token-123',
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Record to update not found.',
        {
          code: 'P2025',
          clientVersion: '7.10.1',
        },
      );

      prismaMock.membershipInvitation.update.mockRejectedValue(prismaError);

      // act & assert
      await expect(repository.update(invitation)).rejects.toBe(prismaError);
    });
  });
});
