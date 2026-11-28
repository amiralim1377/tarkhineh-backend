import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../../generated/prisma/client.js';

import { BranchMenuItem } from '../../domain/entities/branch-menu-item.js';

import { BRANCH_MENU_ITEM_STATUS } from '../../domain/types/branch-menu-item-status.js';

import { BRANCH_MENU_ITEM_AVAILABILITY } from '../../domain/types/branch-menu-item-availability.js';

import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import { type PrismaBranchMenuItemRecord } from './mappers/prisma-branch-menu-item.mapper.js';

import { PrismaBranchMenuItemRepository } from './prisma-branch-menu-item.repository.js';

vi.mock('../../../../prisma/errors/prisma-error-translator.js', () => ({
  normalizePrismaError: vi.fn(() => new Error('Normalized Prisma error.')),
}));

type PrismaClientMock = {
  branchMenuItem: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function createBranchMenuItem(): BranchMenuItem {
  return BranchMenuItem.create({
    id: 'branch-menu-item-1',
    organizationId: 'organization-1',
    branchId: 'branch-1',
    menuItemId: 'menu-item-1',
    priceOverrideInToman: 450000,
    displayOrder: 2,
  });
}

function createPrismaRecord(
  overrides: Partial<PrismaBranchMenuItemRecord> = {},
): PrismaBranchMenuItemRecord {
  return {
    id: 'branch-menu-item-1',
    organizationId: 'organization-1',
    branchId: 'branch-1',
    menuItemId: 'menu-item-1',
    priceOverride: 450000n,
    displayOrder: 2,
    status: BRANCH_MENU_ITEM_STATUS.ACTIVE,
    availability: BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    ...overrides,
  };
}

function createP2034Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or deadlock.',
    {
      code: 'P2034',
      clientVersion: 'test',
    },
  );
}

describe('PrismaBranchMenuItemRepository', () => {
  let repository: PrismaBranchMenuItemRepository;
  let prisma: PrismaClientMock;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      branchMenuItem: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    repository = new PrismaBranchMenuItemRepository(prisma as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // findById
  // ============================================================

  describe('findById', () => {
    it('should return BranchMenuItem when the record exists', async () => {
      // Arrange
      const record = createPrismaRecord();

      prisma.branchMenuItem.findFirst.mockResolvedValue(record);

      // Act
      const result = await repository.findById(
        'organization-1',
        'branch-menu-item-1',
      );

      // Assert
      expect(result).toBeInstanceOf(BranchMenuItem);
      expect(result?.id).toBe('branch-menu-item-1');
      expect(result?.organizationId).toBe('organization-1');
      expect(result?.branchId).toBe('branch-1');
      expect(result?.menuItemId).toBe('menu-item-1');
      expect(result?.priceOverride?.value).toBe(450000);

      expect(prisma.branchMenuItem.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'branch-menu-item-1',
          organizationId: 'organization-1',
        },
      });
    });

    it('should return null when the record does not exist', async () => {
      // Arrange
      prisma.branchMenuItem.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findById(
        'organization-1',
        'unknown-branch-menu-item',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const error = createP2034Error();

      prisma.branchMenuItem.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(
        repository.findById('organization-1', 'branch-menu-item-1'),
      ).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const error = new Error('Database connection failed.');

      prisma.branchMenuItem.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(
        repository.findById('organization-1', 'branch-menu-item-1'),
      ).rejects.toThrow('Normalized Prisma error.');

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });

  // ============================================================
  // findByBranchAndMenuItem
  // ============================================================

  describe('findByBranchAndMenuItem', () => {
    it('should return BranchMenuItem when the relation exists', async () => {
      // Arrange
      const record = createPrismaRecord();

      prisma.branchMenuItem.findFirst.mockResolvedValue(record);

      // Act
      const result = await repository.findByBranchAndMenuItem(
        'organization-1',
        'branch-1',
        'menu-item-1',
      );

      // Assert
      expect(result).toBeInstanceOf(BranchMenuItem);
      expect(result?.branchId).toBe('branch-1');
      expect(result?.menuItemId).toBe('menu-item-1');

      expect(prisma.branchMenuItem.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'organization-1',
          branchId: 'branch-1',
          menuItemId: 'menu-item-1',
        },
      });
    });

    it('should return null when the relation does not exist', async () => {
      // Arrange
      prisma.branchMenuItem.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findByBranchAndMenuItem(
        'organization-1',
        'branch-1',
        'menu-item-1',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const error = createP2034Error();

      prisma.branchMenuItem.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(
        repository.findByBranchAndMenuItem(
          'organization-1',
          'branch-1',
          'menu-item-1',
        ),
      ).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const error = new Error('Database query failed.');

      prisma.branchMenuItem.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(
        repository.findByBranchAndMenuItem(
          'organization-1',
          'branch-1',
          'menu-item-1',
        ),
      ).rejects.toThrow('Normalized Prisma error.');

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });

  // ============================================================
  // save
  // ============================================================

  describe('save', () => {
    it('should create BranchMenuItem in the database', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();

      prisma.branchMenuItem.create.mockResolvedValue({});

      // Act
      await repository.save(branchMenuItem);

      // Assert
      expect(prisma.branchMenuItem.create).toHaveBeenCalledWith({
        data: {
          id: branchMenuItem.id,
          organizationId: branchMenuItem.organizationId,
          branchId: branchMenuItem.branchId,
          menuItemId: branchMenuItem.menuItemId,
          priceOverride: 450000n,
          displayOrder: 2,
          status: BRANCH_MENU_ITEM_STATUS.ACTIVE,
          availability: BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
          createdAt: branchMenuItem.createdAt,
          updatedAt: branchMenuItem.updatedAt,
        },
      });
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();
      const error = createP2034Error();

      prisma.branchMenuItem.create.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.save(branchMenuItem)).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();
      const error = new Error('Branch menu item creation failed.');

      prisma.branchMenuItem.create.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.save(branchMenuItem)).rejects.toThrow(
        'Normalized Prisma error.',
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });

  // ============================================================
  // update
  // ============================================================

  describe('update', () => {
    it('should update BranchMenuItem data', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();

      branchMenuItem.changePriceOverride(500000);
      branchMenuItem.updateDisplayOrder(5);
      branchMenuItem.deactivate();
      branchMenuItem.markAsUnavailable();

      prisma.branchMenuItem.update.mockResolvedValue({});

      // Act
      await repository.update(branchMenuItem);

      // Assert
      expect(prisma.branchMenuItem.update).toHaveBeenCalledWith({
        where: {
          id: 'branch-menu-item-1',
          organizationId: 'organization-1',
        },
        data: {
          priceOverride: 500000n,
          displayOrder: 5,
          status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
          availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
          updatedAt: branchMenuItem.updatedAt,
        },
      });
    });

    it('should set priceOverride to null when the override is cleared', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();

      branchMenuItem.clearPriceOverride();

      prisma.branchMenuItem.update.mockResolvedValue({});

      // Act
      await repository.update(branchMenuItem);

      // Assert
      expect(prisma.branchMenuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceOverride: null,
          }),
        }),
      );
    });

    it('should propagate P2034 error without normalizing it', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();
      const error = createP2034Error();

      prisma.branchMenuItem.update.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.update(branchMenuItem)).rejects.toBe(error);

      expect(normalizePrismaError).not.toHaveBeenCalled();
    });

    it('should normalize other Prisma errors', async () => {
      // Arrange
      const branchMenuItem = createBranchMenuItem();
      const error = new Error('Branch menu item update failed.');

      prisma.branchMenuItem.update.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.update(branchMenuItem)).rejects.toThrow(
        'Normalized Prisma error.',
      );

      expect(normalizePrismaError).toHaveBeenCalledWith(error);
    });
  });
});
