import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { PrismaBranchRepository } from './prisma-branch.repository.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';
import { Branch } from '../../domain/entities/branch.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { BranchSlugAlreadyExistsError } from '../../application/errors/branch-slug-already-exists.error.js';

describe('PrismaBranchRepository', () => {
  const prisma = {
    branch: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  let repository: PrismaBranchRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    repository = new PrismaBranchRepository(prisma as unknown as PrismaService);
  });

  describe('existsBySlug', () => {
    it('should return true when branch exists', async () => {
      // arrange
      const validInput = {
        organizationId: 'organization-id',
        slug: 'branch-123',
      };
      prisma.branch.findUnique.mockResolvedValue({
        id: 'branch-123',
      });
      // act
      const actual = await repository.existsBySlug(
        validInput.organizationId,
        validInput.slug,
      );
      //   assert
      expect(actual).toBe(true);
      expect(prisma.branch.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_slug: {
            organizationId: validInput.organizationId,
            slug: validInput.slug,
          },
        },
        select: {
          id: true,
        },
      });
    });

    it('should return false when branch does not exist', async () => {
      // arrange
      const validInput = {
        organizationId: 'organization-id',
        slug: 'branch-123',
      };
      prisma.branch.findUnique.mockResolvedValue(null);

      //   act
      const actual = await repository.existsBySlug(
        validInput.organizationId,
        validInput.slug,
      );

      //   assert
      expect(actual).toBe(false);
    });

    it('should throw DependencyUnavailableError when database is unavailable', async () => {
      // arrange
      const validInput = {
        organizationId: 'organization-id',
        slug: 'branch-123',
      };

      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prisma.branch.findUnique.mockRejectedValue(databaseError);

      // act & assert
      await expect(
        repository.existsBySlug(validInput.organizationId, validInput.slug),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });
  });

  describe('save', () => {
    it('should save a new branch', async () => {
      // Arrange
      const validBranch = Branch.create({
        id: 'f19524df-8a26-4115-9731-e32a03ad83a5',
        organizationId: 'organization-id',
        nameFa: 'شعبه تستی',
        nameEn: 'Test Branch',
        slug: 'test-branch',
        phoneNumber: '+982188658548',
        addressFa: 'تهران، میدان ونک',
        addressEn: 'Vanak Square, Tehran',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '145888',
        countryCode: 'IR',
        latitude: 35.6892,
        longitude: 51.389,
        timeZoneId: 'Asia/Tehran',
      });

      prisma.branch.create.mockResolvedValue({
        id: validBranch.id,
      });

      // act & assert
      await expect(repository.save(validBranch)).resolves.toBeUndefined();
      expect(prisma.branch.create).toHaveBeenCalledTimes(1);
    });

    it('should throw BranchSlugAlreadyExistsError when slug already exists', async () => {
      // Arrange
      const validBranch = Branch.create({
        id: 'f19524df-8a26-4115-9731-e32a03ad83a5',
        organizationId: 'organization-id',
        nameFa: 'شعبه تستی',
        nameEn: 'Test Branch',
        slug: 'test-branch',
        phoneNumber: '+982188658548',
        addressFa: 'تهران، میدان ونک',
        addressEn: 'Vanak Square, Tehran',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '145888',
        countryCode: 'IR',
        latitude: 35.6892,
        longitude: 51.389,
        timeZoneId: 'Asia/Tehran',
      });
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            target: ['organizationId', 'slug'],
          },
        },
      );

      prisma.branch.create.mockRejectedValue(prismaError);

      // act & assert
      await expect(repository.save(validBranch)).rejects.toBeInstanceOf(
        BranchSlugAlreadyExistsError,
      );
    });

    it('should throw BranchSlugAlreadyExistsError when Prisma reports the unique constraint target as a string', async () => {
      // Arrange
      const validBranch = Branch.create({
        id: 'f19524df-8a26-4115-9731-e32a03ad83a5',
        organizationId: 'organization-id',
        nameFa: 'شعبه تستی',
        nameEn: 'Test Branch',
        slug: 'test-branch',
        phoneNumber: '+982188658548',
        addressFa: 'تهران، میدان ونک',
        addressEn: 'Vanak Square, Tehran',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '145888',
        countryCode: 'IR',
        latitude: 35.6892,
        longitude: 51.389,
        timeZoneId: 'Asia/Tehran',
      });
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            target: 'Branch_organizationId_slug_key',
          },
        },
      );
      prisma.branch.create.mockRejectedValue(prismaError);

      // act & assert
      await expect(repository.save(validBranch)).rejects.toBeInstanceOf(
        BranchSlugAlreadyExistsError,
      );
    });

    it('should preserve the orginal error when another unique constraint is violated', async () => {
      // Arrange
      const validBranch = Branch.create({
        id: 'f19524df-8a26-4115-9731-e32a03ad83a5',
        organizationId: 'organization-id',
        nameFa: 'شعبه تستی',
        nameEn: 'Test Branch',
        slug: 'test-branch',
        phoneNumber: '+982188658548',
        addressFa: 'تهران، میدان ونک',
        addressEn: 'Vanak Square, Tehran',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '145888',
        countryCode: 'IR',
        latitude: 35.6892,
        longitude: 51.389,
        timeZoneId: 'Asia/Tehran',
      });
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            target: ['id', 'organizationId'],
          },
        },
      );

      prisma.branch.create.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(repository.save(validBranch)).rejects.toBe(prismaError);
    });

    it('should throw DependencyUnavailableError when database is unavailable', async () => {
      // Arrange
      const validBranch = Branch.create({
        id: 'f19524df-8a26-4115-9731-e32a03ad83a5',
        organizationId: 'organization-id',
        nameFa: 'شعبه تستی',
        nameEn: 'Test Branch',
        slug: 'test-branch',
        phoneNumber: '+982188658548',
        addressFa: 'تهران، میدان ونک',
        addressEn: 'Vanak Square, Tehran',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '145888',
        countryCode: 'IR',
        latitude: 35.6892,
        longitude: 51.389,
        timeZoneId: 'Asia/Tehran',
      });

      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prisma.branch.create.mockRejectedValue(databaseError);

      // act & assert
      await expect(repository.save(validBranch)).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
    });
  });
});
