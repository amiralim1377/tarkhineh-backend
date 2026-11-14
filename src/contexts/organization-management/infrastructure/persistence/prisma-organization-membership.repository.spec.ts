import { PrismaService } from '../../../../prisma/prisma.service.js';
import { OrganizationMembership } from '../../domain/entities/organization-membership.js';
import { PrismaOrganizationMembershipRepository } from './prisma-organization-membership.repository.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';
import { InvalidOrganizationMembershipDataError } from '../../domain/errors/invalid-organization-membership.error.js';

describe('PrismaOrganizationMembershipRepository', () => {
  const prisma = {
    organizationMembership: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  let repository: PrismaOrganizationMembershipRepository;
  beforeEach(() => {
    vi.resetAllMocks();

    repository = new PrismaOrganizationMembershipRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('findById', () => {
    it('should return an organization membership when found', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        membershipId: 'membership-123',
      };

      const now = new Date();

      const resolvedMembership = {
        id: input.membershipId,
        organizationId: input.organizationId,
        userId: 'user-123',
        status: 'ACTIVE' as const,
        createdAt: now,
        updatedAt: now,
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(
        resolvedMembership,
      );

      // act
      const membership = await repository.findById(
        input.organizationId,
        input.membershipId,
      );

      // assert
      expect(membership).toBeInstanceOf(OrganizationMembership);

      expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: input.membershipId,
            organizationId: input.organizationId,
          },
        },
      });
    });

    it('should return null when membership does not exist', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        membershipId: 'membership-123',
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(null);

      // act
      const membership = await repository.findById(
        input.organizationId,
        input.membershipId,
      );

      // assert
      expect(membership).toBeNull();
    });

    it('should find membership using organization ID and membership ID', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        membershipId: 'membership-123',
      };

      const now = new Date();

      const resolvedMembership = {
        id: input.membershipId,
        organizationId: input.organizationId,
        userId: 'user-123',
        status: 'ACTIVE' as const,
        createdAt: now,
        updatedAt: now,
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(
        resolvedMembership,
      );

      // act
      await repository.findById(input.organizationId, input.membershipId);

      // assert
      expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: input.membershipId,
            organizationId: input.organizationId,
          },
        },
      });
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        membershipId: 'membership-123',
      };

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Timed out fetching a new connection from the connection pool',
        {
          code: 'P2024',
          clientVersion: 'test',
        },
      );
      prisma.organizationMembership.findUnique.mockRejectedValue(prismaError);

      //  act & assert
      await expect(
        repository.findById(input.organizationId, input.membershipId),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during reconstitution', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        membershipId: 'membership-123',
      };
      const now = new Date();

      const resolvedMembership = {
        id: input.membershipId,
        organizationId: input.organizationId,
        userId: 'user-123',
        status: 'INVALID_STATUS' as never,
        createdAt: now,
        updatedAt: now,
      };
      prisma.organizationMembership.findUnique.mockResolvedValue(
        resolvedMembership,
      );

      //   act& assert

      await expect(
        repository.findById(input.organizationId, input.membershipId),
      ).rejects.toBeInstanceOf(InvalidOrganizationMembershipDataError);
    });
  });

  describe('findByOrganizationAndUser', () => {
    it('should return an organization membership when found', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        userId: 'user-123',
      };

      const now = new Date();

      const resolvedMembership = {
        id: 'membership-123',
        organizationId: input.organizationId,
        userId: input.userId,
        status: 'ACTIVE' as const,
        createdAt: now,
        updatedAt: now,
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(
        resolvedMembership,
      );

      // act
      const membership = await repository.findByOrganizationAndUser(
        input.organizationId,
        input.userId,
      );

      // assert
      expect(membership).toBeInstanceOf(OrganizationMembership);
      expect(membership?.organizationId).toBe(input.organizationId);
      expect(membership?.userId).toBe(input.userId);
    });

    it('should return null when membership does not exist', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        userId: 'user-123',
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(null);

      // act
      const membership = await repository.findByOrganizationAndUser(
        input.organizationId,
        input.userId,
      );

      // assert
      expect(membership).toBeNull();
    });

    it('should find membership using organization ID and user ID', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        userId: 'user-123',
      };

      const now = new Date();

      const resolvedMembership = {
        id: 'membership-123',
        organizationId: input.organizationId,
        userId: input.userId,
        status: 'ACTIVE' as const,
        createdAt: now,
        updatedAt: now,
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(
        resolvedMembership,
      );

      // act
      await repository.findByOrganizationAndUser(
        input.organizationId,
        input.userId,
      );

      // assert
      expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.userId,
          },
        },
      });
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        userId: 'user-123',
      };

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Connection pool timeout',
        {
          code: 'P2024',
          clientVersion: 'test',
        },
      );

      prisma.organizationMembership.findUnique.mockRejectedValue(prismaError);

      // act & assert
      await expect(
        repository.findByOrganizationAndUser(
          input.organizationId,
          input.userId,
        ),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during reconstitution', async () => {
      // arrange
      const input = {
        organizationId: 'organization-123',
        userId: 'user-123',
      };

      const now = new Date();

      const resolvedMembership = {
        id: 'membership-123',
        organizationId: input.organizationId,
        userId: input.userId,
        status: 'INVALID_STATUS' as never,
        createdAt: now,
        updatedAt: now,
      };

      prisma.organizationMembership.findUnique.mockResolvedValue(
        resolvedMembership,
      );

      // act & assert
      await expect(
        repository.findByOrganizationAndUser(
          input.organizationId,
          input.userId,
        ),
      ).rejects.toBeInstanceOf(InvalidOrganizationMembershipDataError);
    });
  });

  describe('save', () => {
    it('should save a new organization membership', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'INVITED',
      });

      prisma.organizationMembership.create.mockResolvedValue({} as never);

      // act
      await repository.save(membership);

      // assert
      expect(prisma.organizationMembership.create).toHaveBeenCalledTimes(1);
    });

    it('should save all organization membership properties', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'ACTIVE',
      });

      prisma.organizationMembership.create.mockResolvedValue({} as never);

      // act
      await repository.save(membership);

      // assert
      expect(prisma.organizationMembership.create).toHaveBeenCalledWith({
        data: {
          id: membership.id,
          organizationId: membership.organizationId,
          userId: membership.userId,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        },
      });
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'INVITED',
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Connection pool timeout',
        {
          code: 'P2024',
          clientVersion: 'test',
        },
      );

      prisma.organizationMembership.create.mockRejectedValue(prismaError);

      // act & assert
      await expect(repository.save(membership)).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
    });
  });

  describe('update', () => {
    it('should update an existing organization membership', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'ACTIVE',
      });

      membership.suspend();

      prisma.organizationMembership.update.mockResolvedValue({} as never);

      // act
      await repository.update(membership);

      // assert
      expect(prisma.organizationMembership.update).toHaveBeenCalledTimes(1);
    });

    it('should use membership ID and organization ID in the where condition', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'ACTIVE',
      });

      prisma.organizationMembership.update.mockResolvedValue({} as never);

      // act
      await repository.update(membership);

      // assert
      expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id_organizationId: {
              id: membership.id,
              organizationId: membership.organizationId,
            },
          },
        }),
      );
    });

    it('should update only mutable properties', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'ACTIVE',
      });

      membership.suspend();

      prisma.organizationMembership.update.mockResolvedValue({} as never);

      // act
      await repository.update(membership);

      // assert
      expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: membership.status,
            updatedAt: membership.updatedAt,
          },
        }),
      );
    });

    it('should normalize Prisma errors', async () => {
      // arrange
      const membership = OrganizationMembership.create({
        id: 'membership-123',
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'ACTIVE',
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Connection pool timeout',
        {
          code: 'P2024',
          clientVersion: 'test',
        },
      );

      prisma.organizationMembership.update.mockRejectedValue(prismaError);

      // act & assert
      await expect(repository.update(membership)).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
    });
  });
});
