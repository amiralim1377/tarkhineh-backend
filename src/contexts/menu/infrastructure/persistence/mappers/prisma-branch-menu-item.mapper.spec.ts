import { describe, expect, it } from 'vitest';
import { BranchMenuItem } from '../../../domain/entities/branch-menu-item.js';
import { BRANCH_MENU_ITEM_STATUS } from '../../../domain/types/branch-menu-item-status.js';
import { BRANCH_MENU_ITEM_AVAILABILITY } from '../../../domain/types/branch-menu-item-availability.js';
import {
  PrismaBranchMenuItemMapper,
  type PrismaBranchMenuItemRecord,
} from './prisma-branch-menu-item.mapper.js';

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

describe('PrismaBranchMenuItemMapper', () => {
  // ============================================================
  // toDomain
  // ============================================================

  describe('toDomain', () => {
    it('should convert Prisma record to BranchMenuItem', () => {
      // Arrange
      const record = createPrismaRecord();

      // Act
      const result = PrismaBranchMenuItemMapper.toDomain(record);

      // Assert
      expect(result).toBeInstanceOf(BranchMenuItem);
      expect(result.id).toBe(record.id);
      expect(result.organizationId).toBe(record.organizationId);
      expect(result.branchId).toBe(record.branchId);
      expect(result.menuItemId).toBe(record.menuItemId);
      expect(result.priceOverride?.value).toBe(450000);
      expect(result.displayOrder).toBe(record.displayOrder);
      expect(result.status).toBe(record.status);
      expect(result.availability).toBe(record.availability);
      expect(result.createdAt).toEqual(record.createdAt);
      expect(result.updatedAt).toEqual(record.updatedAt);
    });

    it('should convert null price override correctly', () => {
      // Arrange
      const record = createPrismaRecord({
        priceOverride: null,
      });

      // Act
      const result = PrismaBranchMenuItemMapper.toDomain(record);

      // Assert
      expect(result.priceOverride).toBeNull();
    });

    it('should preserve status and availability', () => {
      // Arrange
      const record = createPrismaRecord({
        status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
        availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      });

      // Act
      const result = PrismaBranchMenuItemMapper.toDomain(record);

      // Assert
      expect(result.status).toBe(BRANCH_MENU_ITEM_STATUS.INACTIVE);
      expect(result.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      );
      expect(result.isInactive()).toBe(true);
      expect(result.isUnavailable()).toBe(true);
    });

    it('should throw RangeError when price override exceeds safe integer range', () => {
      // Arrange
      const record = createPrismaRecord({
        priceOverride: 9007199254740992n,
      });

      // Act & Assert
      expect(() => PrismaBranchMenuItemMapper.toDomain(record)).toThrow(
        RangeError,
      );
    });
  });

  // ============================================================
  // toPersistence
  // ============================================================

  describe('toPersistence', () => {
    it('should convert BranchMenuItem to Prisma data', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        id: 'branch-menu-item-1',
        organizationId: 'organization-1',
        branchId: 'branch-1',
        menuItemId: 'menu-item-1',
        priceOverrideInToman: 450000,
        displayOrder: 2,
      });

      // Act
      const result = PrismaBranchMenuItemMapper.toPersistence(branchMenuItem);

      // Assert
      expect(result).toEqual({
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
      });
    });

    it('should convert null price override correctly', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        id: 'branch-menu-item-1',
        organizationId: 'organization-1',
        branchId: 'branch-1',
        menuItemId: 'menu-item-1',
      });

      // Act
      const result = PrismaBranchMenuItemMapper.toPersistence(branchMenuItem);

      // Assert
      expect(result.priceOverride).toBeNull();
    });

    it('should preserve updated status and availability', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        id: 'branch-menu-item-1',
        organizationId: 'organization-1',
        branchId: 'branch-1',
        menuItemId: 'menu-item-1',
      });

      branchMenuItem.deactivate();
      branchMenuItem.markAsUnavailable();

      // Act
      const result = PrismaBranchMenuItemMapper.toPersistence(branchMenuItem);

      // Assert
      expect(result.status).toBe(BRANCH_MENU_ITEM_STATUS.INACTIVE);
      expect(result.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      );
    });
  });
});
