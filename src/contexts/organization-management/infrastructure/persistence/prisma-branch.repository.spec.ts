import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { PrismaBranchRepository } from './prisma-branch.repository.js';
import { DependencyUnavailableError } from '../../../../shared/application/errors/dependency-unavailable.error.js';
import { Branch } from '../../domain/entities/branch.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { BranchSlugAlreadyExistsError } from '../../application/errors/branch-slug-already-exists.error.js';
import { InvalidBranchDataError } from '../../domain/errors/invalid-branch-data.error.js';

describe('PrismaBranchRepository', () => {
  const prisma = {
    branch: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

    it('should preserve the original error when another unique constraint is violated and target is a string', async () => {
      // Arrange
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
            target: 'Branch_id_organizationId_key',
          },
        },
      );
      prisma.branch.create.mockRejectedValue(prismaError);
      // Act & Assert
      // act & assert
      await expect(repository.save(validBranch)).rejects.toBe(prismaError);
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

  describe('findById', () => {
    it('should return a reconstituted branch when found', async () => {
      // arrange
      const input = {
        organizationId: 'organization-Id',
        branchId: 'branch-Id',
      };
      const persistedBranch = {
        id: 'branch-Id',
        organizationId: 'organization-Id',
        nameFa: 'شعبه ونک',
        nameEn: 'Vanak Branch',
        slug: 'vanak',
        status: 'ACTIVE',
        phoneNumber: '+982188888888',
        addressFa: 'تهران، میدان ونک',
        addressEn: null,
        cityFa: 'تهران',
        cityEn: null,
        postalCode: null,
        countryCode: 'IR',
        latitude: 35.7575,
        longitude: 51.4106,
        timeZoneId: 'Asia/Tehran',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        updatedAt: new Date('2026-01-02T10:00:00.000Z'),
      };
      prisma.branch.findUnique.mockResolvedValue(persistedBranch);

      // act
      const branch = await repository.findById(
        input.organizationId,
        input.branchId,
      );

      // assert
      expect(branch).toBeInstanceOf(Branch);
      expect(branch?.id).toBe(persistedBranch.id);
      expect(branch?.slug).toBe(persistedBranch.slug);

      expect(prisma.branch.findUnique).toHaveBeenCalledWith({
        where: {
          id: input.branchId,
          organizationId: input.organizationId,
        },
        select: expect.any(Object),
      });
    });

    it('should return null when the branch does not exist', async () => {
      // arrange
      const input = {
        organizationId: 'organization-Id',
        branchId: 'branch-Id',
      };

      prisma.branch.findUnique.mockResolvedValue(null);

      // act
      const branch = await repository.findById(
        input.organizationId,
        input.branchId,
      );

      // assert
      expect(branch).toBeNull();
      expect(prisma.branch.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should find the branch using both branch ID and organization ID', async () => {
      // arrange
      const input = {
        organizationId: 'organization-Id-123',
        branchId: 'branch-Id-321',
      };
      const persistedBranch = {
        id: 'branch-Id-321',
        organizationId: 'organization-Id-123',
        nameFa: 'شعبه ونک',
        nameEn: 'Vanak Branch',
        slug: 'vanak',
        status: 'ACTIVE',
        phoneNumber: '+982188888888',
        addressFa: 'تهران، میدان ونک',
        addressEn: null,
        cityFa: 'تهران',
        cityEn: null,
        postalCode: null,
        countryCode: 'IR',
        latitude: 35.7575,
        longitude: 51.4106,
        timeZoneId: 'Asia/Tehran',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        updatedAt: new Date('2026-01-02T10:00:00.000Z'),
      };
      prisma.branch.findUnique.mockResolvedValue(persistedBranch);

      // act
      const branch = await repository.findById(
        input.organizationId,
        input.branchId,
      );

      // assertion
      expect(branch?.id).toBe('branch-Id-321');
      expect(branch?.organizationId).toBe('organization-Id-123');
      expect(prisma.branch.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.branch.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: input.branchId,
            organizationId: input.organizationId,
          },
        }),
      );
    });

    it('should normalize database errors', async () => {
      // arrange
      const input = {
        organizationId: 'organization-Id-123',
        branchId: 'branch-Id-321',
      };
      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prisma.branch.findUnique.mockRejectedValue(databaseError);

      // act
      await expect(
        repository.findById(input.organizationId, input.branchId),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('should propagate domain errors during branch reconstitution', async () => {
      // arrange
      const input = {
        organizationId: 'organization-Id-123',
        branchId: 'branch-Id-321',
      };
      const persistedBranch = {
        id: input.branchId,
        organizationId: input.organizationId,
        nameFa: 'شعبه ونک',
        nameEn: 'Vanak Branch',
        slug: 'vanak',
        status: 'INVALID_STATUS',
        phoneNumber: '+982188888888',
        addressFa: 'تهران، میدان ونک',
        addressEn: null,
        cityFa: 'تهران',
        cityEn: null,
        postalCode: null,
        countryCode: 'IR',
        latitude: 35.7575,
        longitude: 51.4106,
        timeZoneId: 'Asia/Tehran',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        updatedAt: new Date('2026-01-02T10:00:00.000Z'),
      };

      prisma.branch.findUnique.mockResolvedValue(persistedBranch as never);

      // act & assert
      await expect(
        repository.findById(input.organizationId, input.branchId),
      ).rejects.toBeInstanceOf(InvalidBranchDataError);
    });
  });

  describe('update', () => {
    const createBranch = () =>
      Branch.create({
        organizationId: 'organization-Id-123',
        nameFa: 'شعبه ونک',
        nameEn: 'Vanak Branch',
        slug: 'vanak',
        phoneNumber: '+982188888888',
        addressFa: 'تهران، میدان ونک',
        cityFa: 'تهران',
        countryCode: 'IR',
        latitude: 35.7575,
        longitude: 51.4106,
        timeZoneId: 'Asia/Tehran',
      });

    it('should update an existing branch', async () => {
      // arrange
      const branch = Branch.create({
        organizationId: 'organization-id',
        nameFa: 'شعبه ونک',
        nameEn: 'Vanak Branch',
        slug: 'vanak',
        phoneNumber: '+982188888888',
        addressFa: 'تهران، میدان ونک',
        cityFa: 'تهران',
        countryCode: 'IR',
        latitude: 35.7575,
        longitude: 51.4106,
        timeZoneId: 'Asia/Tehran',
      });

      prisma.branch.update.mockResolvedValue({});
      // Act
      await repository.update(branch);

      // assert
      expect(prisma.branch.update.mock.calls[0][0].data).not.toHaveProperty(
        'slug',
      );
      expect(prisma.branch.update).toHaveBeenCalledTimes(1);
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: {
          id: branch.id,
          organizationId: branch.organizationId,
        },
        data: {
          nameFa: branch.nameFa,
          nameEn: branch.nameEn,
          status: branch.status,
          phoneNumber: branch.phoneNumber,
          addressFa: branch.addressFa,
          addressEn: branch.addressEn,
          cityFa: branch.cityFa,
          cityEn: branch.cityEn,
          postalCode: branch.postalCode,
          countryCode: branch.countryCode,
          latitude: branch.latitude,
          longitude: branch.longitude,
          timeZoneId: branch.timeZoneId,
          updatedAt: branch.updatedAt,
        },
      });
    });

    it('should use branch ID and organization ID to identify the branch', async () => {
      // arrange
      const input = {
        organizationId: 'organization-Id-123',
        branchId: 'branch-Id-321',
      };
      const branch = Branch.create({
        organizationId: input.organizationId,
        nameFa: 'شعبه ونک',
        nameEn: 'Vanak Branch',
        slug: 'vanak',
        phoneNumber: '+982188888888',
        addressFa: 'تهران، میدان ونک',
        cityFa: 'تهران',
        countryCode: 'IR',
        latitude: 35.7575,
        longitude: 51.4106,
        timeZoneId: 'Asia/Tehran',
      });

      prisma.branch.update.mockResolvedValue({});

      // act
      repository.update(branch);

      // assert
      expect(prisma.branch.update).toHaveBeenCalledTimes(1);

      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: branch.id,
            organizationId: branch.organizationId,
          },
        }),
      );
    });

    it('should not modify the branch slug', async () => {
      // arrange
      const branch = createBranch();

      prisma.branch.update.mockResolvedValue({});

      // act
      await repository.update(branch);

      // assert
      const updateData = prisma.branch.update.mock.calls[0]?.[0].data;

      expect(updateData).not.toHaveProperty('slug');
      expect(branch.slug).toBe('vanak');
    });

    it('should not modify the branch ID or organization ID', async () => {
      // arrange
      const branch = createBranch();

      prisma.branch.update.mockResolvedValue({});

      // act
      await repository.update(branch);

      // assert
      const updateData = prisma.branch.update.mock.calls[0]?.[0].data;

      expect(updateData).not.toHaveProperty('id');
      expect(updateData).not.toHaveProperty('organizationId');

      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: branch.id,
            organizationId: branch.organizationId,
          },
        }),
      );
    });

    it('should not modify the branch createdAt timestamp', async () => {
      // arrange
      const branch = createBranch();

      prisma.branch.update.mockResolvedValue({});

      // act
      await repository.update(branch);

      // assert
      const updateData = prisma.branch.update.mock.calls[0]?.[0].data;

      expect(updateData).not.toHaveProperty('createdAt');
      expect(updateData).toHaveProperty('updatedAt');
    });

    it('should normalize database errors', async () => {
      // arrange
      const branch = createBranch();

      const databaseError = Object.assign(
        new Error('Database connection failed'),
        {
          code: 'ECONNREFUSED',
        },
      );

      prisma.branch.update.mockRejectedValue(databaseError);

      // act & assert
      await expect(repository.update(branch)).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );

      expect(prisma.branch.update).toHaveBeenCalledTimes(1);
    });
  });
});
