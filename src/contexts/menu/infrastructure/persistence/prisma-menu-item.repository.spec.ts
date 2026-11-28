import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../../generated/prisma/client.js';
import { MenuItem } from '../../domain/entities/menu-item.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaMenuItemMapper } from './mappers/prisma-menu-item.mapper.js';
import { PrismaMenuItemRepository } from './prisma-menu-item.repository.js';

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError: vi.fn(() => new Error('Normalized Prisma error.')),
}));

// Mock Prisma Client structure
type PrismaClientMock = {
  menuItem: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  menuItemCategory: {
    findMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

// Fake MenuItem for repository tests
function createMenuItem(
  categoryIds: string[] = ['category-1', 'category-2'],
): MenuItem {
  return {
    id: 'menu-item-1',
    organizationId: 'organization-1',
    nameFa: 'پیتزا مخصوص',
    nameEn: 'Special Pizza',
    descriptionFa: 'پیتزای مخصوص رستوران',
    descriptionEn: 'Restaurant special pizza',
    imageId: null,
    basePrice: {
      value: 350000,
    },
    categoryIds,
    status: 'DRAFT',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
  } as unknown as MenuItem;
}

// Create a Prisma P2034 error without depending on its constructor signature
function createP2034Error(): Prisma.PrismaClientKnownRequestError {
  const error = new Error(
    'Transaction failed due to a write conflict or deadlock.',
  ) as Prisma.PrismaClientKnownRequestError;

  Object.setPrototypeOf(error, Prisma.PrismaClientKnownRequestError.prototype);

  Object.defineProperty(error, 'code', {
    value: 'P2034',
  });

  return error;
}

describe('PrismaMenuItemRepository', () => {
  let repository: PrismaMenuItemRepository;
  let prisma: PrismaClientMock;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      menuItem: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      menuItemCategory: {
        findMany: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    repository = new PrismaMenuItemRepository(prisma as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // findById
  // ============================================================

  describe('findById', () => {
    it('should return MenuItem when the record exists', async () => {
      // Arrange
      const organizationId = 'organization-1';
      const menuItemId = 'menu-item-1';

      const menuItemRecord = {
        id: menuItemId,
        organizationId,
        menuItemCategories: [],
      };

      const expectedMenuItem = createMenuItem([]);

      prisma.menuItem.findUnique.mockResolvedValue(menuItemRecord);

      const mapperSpy = vi
        .spyOn(PrismaMenuItemMapper, 'toDomain')
        .mockReturnValue(expectedMenuItem);

      // Act
      const result = await repository.findById(organizationId, menuItemId);

      // Assert
      expect(result).toBe(expectedMenuItem);

      expect(prisma.menuItem.findUnique).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: menuItemId,
            organizationId,
          },
        },
        include: {
          menuItemCategories: {
            select: {
              categoryId: true,
            },
          },
        },
      });

      expect(mapperSpy).toHaveBeenCalledWith(menuItemRecord);
    });

    it('should return null when the record does not exist', async () => {
      // Arrange
      prisma.menuItem.findUnique.mockResolvedValue(null);

      const mapperSpy = vi.spyOn(PrismaMenuItemMapper, 'toDomain');

      // Act
      const result = await repository.findById(
        'organization-1',
        'unknown-menu-item',
      );

      // Assert
      expect(result).toBeNull();

      expect(mapperSpy).not.toHaveBeenCalled();
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const error = createP2034Error();

      prisma.menuItem.findUnique.mockRejectedValue(error);

      // Act & Assert
      await expect(
        repository.findById('organization-1', 'menu-item-1'),
      ).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const error = new Error('Database connection failed.');

      prisma.menuItem.findUnique.mockRejectedValue(error);

      // Act & Assert
      await expect(
        repository.findById('organization-1', 'menu-item-1'),
      ).rejects.toThrow('Normalized Prisma error.');

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });

  // ============================================================
  // save
  // ============================================================

  describe('save', () => {
    it('should create MenuItem in the database', async () => {
      // Arrange
      const menuItem = createMenuItem();

      prisma.menuItem.create.mockResolvedValue({});

      prisma.menuItemCategory.createMany.mockResolvedValue({
        count: 2,
      });

      // Act
      await repository.save(menuItem);

      // Assert
      expect(prisma.menuItem.create).toHaveBeenCalledWith({
        data: {
          id: 'menu-item-1',
          organizationId: 'organization-1',
          nameFa: 'پیتزا مخصوص',
          nameEn: 'Special Pizza',
          descriptionFa: 'پیتزای مخصوص رستوران',
          descriptionEn: 'Restaurant special pizza',
          imageId: null,
          basePrice: 350000n,
          status: 'DRAFT',
          createdAt: menuItem.createdAt,
          updatedAt: menuItem.updatedAt,
        },
      });
    });

    it('should create category relations for MenuItem', async () => {
      // Arrange
      const menuItem = createMenuItem(['category-1', 'category-2']);

      prisma.menuItem.create.mockResolvedValue({});

      prisma.menuItemCategory.createMany.mockResolvedValue({
        count: 2,
      });

      // Act
      await repository.save(menuItem);

      // Assert
      expect(prisma.menuItemCategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            organizationId: 'organization-1',
            menuItemId: 'menu-item-1',
            categoryId: 'category-1',
            displayOrder: 0,
          },
          {
            organizationId: 'organization-1',
            menuItemId: 'menu-item-1',
            categoryId: 'category-2',
            displayOrder: 0,
          },
        ],
      });
    });

    it('should not create category relations when MenuItem has no categories', async () => {
      // Arrange
      const menuItem = createMenuItem([]);

      prisma.menuItem.create.mockResolvedValue({});

      // Act
      await repository.save(menuItem);

      // Assert
      expect(prisma.menuItem.create).toHaveBeenCalledTimes(1);

      expect(prisma.menuItemCategory.createMany).not.toHaveBeenCalled();
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const menuItem = createMenuItem();

      const error = createP2034Error();

      prisma.menuItem.create.mockResolvedValue({});

      prisma.menuItemCategory.createMany.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.save(menuItem)).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const menuItem = createMenuItem();

      const error = new Error('MenuItem creation failed.');

      prisma.menuItem.create.mockResolvedValue({});

      prisma.menuItemCategory.createMany.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.save(menuItem)).rejects.toThrow(
        'Normalized Prisma error.',
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });

  // ============================================================
  // update
  // ============================================================

  describe('update', () => {
    it('should update MenuItem data', async () => {
      // Arrange
      const menuItem = createMenuItem([]);

      prisma.menuItemCategory.findMany.mockResolvedValue([]);

      prisma.menuItem.update.mockResolvedValue({});

      // Act
      await repository.update(menuItem);

      // Assert
      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: 'menu-item-1',
            organizationId: 'organization-1',
          },
        },
        data: {
          nameFa: 'پیتزا مخصوص',
          nameEn: 'Special Pizza',
          descriptionFa: 'پیتزای مخصوص رستوران',
          descriptionEn: 'Restaurant special pizza',
          imageId: null,
          basePrice: 350000n,
          status: 'DRAFT',
          updatedAt: menuItem.updatedAt,
        },
      });
    });

    it('should add new categories and remove deleted categories', async () => {
      // Arrange
      const menuItem = createMenuItem(['category-1', 'category-3']);

      prisma.menuItemCategory.findMany.mockResolvedValue([
        { categoryId: 'category-1' },
        { categoryId: 'category-2' },
      ]);

      prisma.menuItem.update.mockResolvedValue({});

      prisma.menuItemCategory.deleteMany.mockResolvedValue({
        count: 1,
      });

      prisma.menuItemCategory.createMany.mockResolvedValue({
        count: 1,
      });

      // Act
      await repository.update(menuItem);

      // Assert: category-2 should be removed
      expect(prisma.menuItemCategory.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'organization-1',
          menuItemId: 'menu-item-1',
          categoryId: {
            in: ['category-2'],
          },
        },
      });

      // Assert: category-3 should be added
      expect(prisma.menuItemCategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            organizationId: 'organization-1',
            menuItemId: 'menu-item-1',
            categoryId: 'category-3',
            displayOrder: 0,
          },
        ],
      });
    });

    it('should remove categories that are no longer assigned', async () => {
      // Arrange
      const menuItem = createMenuItem(['category-1']);

      prisma.menuItemCategory.findMany.mockResolvedValue([
        { categoryId: 'category-1' },
        { categoryId: 'category-2' },
      ]);

      prisma.menuItem.update.mockResolvedValue({});

      prisma.menuItemCategory.deleteMany.mockResolvedValue({
        count: 1,
      });

      // Act
      await repository.update(menuItem);

      // Assert
      expect(prisma.menuItemCategory.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'organization-1',
          menuItemId: 'menu-item-1',
          categoryId: {
            in: ['category-2'],
          },
        },
      });

      expect(prisma.menuItemCategory.createMany).not.toHaveBeenCalled();
    });

    it('should add new categories without deleting existing relations', async () => {
      // Arrange
      const menuItem = createMenuItem([
        'category-1',
        'category-2',
        'category-3',
      ]);

      prisma.menuItemCategory.findMany.mockResolvedValue([
        { categoryId: 'category-1' },
        { categoryId: 'category-2' },
      ]);

      prisma.menuItem.update.mockResolvedValue({});

      prisma.menuItemCategory.createMany.mockResolvedValue({
        count: 1,
      });

      // Act
      await repository.update(menuItem);

      // Assert
      expect(prisma.menuItemCategory.deleteMany).not.toHaveBeenCalled();

      expect(prisma.menuItemCategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            organizationId: 'organization-1',
            menuItemId: 'menu-item-1',
            categoryId: 'category-3',
            displayOrder: 0,
          },
        ],
      });
    });

    it('should not modify category relations when categories have not changed', async () => {
      // Arrange
      const menuItem = createMenuItem(['category-1', 'category-2']);

      prisma.menuItemCategory.findMany.mockResolvedValue([
        { categoryId: 'category-1' },
        { categoryId: 'category-2' },
      ]);

      prisma.menuItem.update.mockResolvedValue({});

      // Act
      await repository.update(menuItem);

      // Assert
      expect(prisma.menuItem.update).toHaveBeenCalledTimes(1);

      expect(prisma.menuItemCategory.deleteMany).not.toHaveBeenCalled();

      expect(prisma.menuItemCategory.createMany).not.toHaveBeenCalled();
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const menuItem = createMenuItem(['category-1']);

      const error = createP2034Error();

      prisma.menuItemCategory.findMany.mockResolvedValue([
        { categoryId: 'category-1' },
        { categoryId: 'category-2' },
      ]);

      prisma.menuItem.update.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.update(menuItem)).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const menuItem = createMenuItem([]);

      const error = new Error('MenuItem update failed.');

      prisma.menuItemCategory.findMany.mockResolvedValue([]);

      prisma.menuItem.update.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.update(menuItem)).rejects.toThrow(
        'Normalized Prisma error.',
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });
});
