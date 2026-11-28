import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchMenuItem } from './branch-menu-item.js';
import type {
  CreateBranchMenuItemInput,
  ReconstituteBranchMenuItemInput,
} from './branch-menu-item.js';
import {
  InvalidBranchMenuItemDataError,
  BRANCH_MENU_ITEM_CODE,
} from '../errors/invalid-branch-menu-item.error.js';
import type { BranchMenuItemDataErrorCode } from '../errors/invalid-branch-menu-item.error.js';
import {
  BRANCH_MENU_ITEM_STATUS,
  type BranchMenuItemStatus,
} from '../types/branch-menu-item-status.js';
import {
  BRANCH_MENU_ITEM_AVAILABILITY,
  type BranchMenuItemAvailability,
} from '../types/branch-menu-item-availability.js';
import { MenuPrice } from '../value-objects/menu-price.vo.js';
import {
  InvalidMenuPriceError,
  MENU_PRICE_CODE,
} from '../errors/invalid-menu-price.error.js';

const BRANCH_MENU_ITEM_ID = 'branch-menu-item-123';
const ORGANIZATION_ID = 'organization-123';
const BRANCH_ID = 'branch-123';
const MENU_ITEM_ID = 'menu-item-123';

// داده اولیه برای ایجاد عرضه غذا در شعبه
const validCreateInput: CreateBranchMenuItemInput = {
  id: BRANCH_MENU_ITEM_ID,
  organizationId: ORGANIZATION_ID,
  branchId: BRANCH_ID,
  menuItemId: MENU_ITEM_ID,
};

// داده اولیه برای بازیابی عرضه غذا از دیتابیس
const validReconstituteInput: ReconstituteBranchMenuItemInput = {
  id: BRANCH_MENU_ITEM_ID,
  organizationId: ORGANIZATION_ID,
  branchId: BRANCH_ID,
  menuItemId: MENU_ITEM_ID,
  priceOverrideInToman: 350000,
  displayOrder: 2,
  status: BRANCH_MENU_ITEM_STATUS.ACTIVE,
  availability: BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

// بررسی خطای مربوط به BranchMenuItem
function expectInvalidBranchMenuItemError(
  action: () => void,
  expectedCode: BranchMenuItemDataErrorCode,
): void {
  let thrownError: unknown;

  try {
    action();
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(InvalidBranchMenuItemDataError);

  expect((thrownError as InvalidBranchMenuItemDataError).code).toBe(
    expectedCode,
  );
}

// بررسی خطای مربوط به MenuPrice
function expectInvalidMenuPriceError(action: () => void): void {
  let thrownError: unknown;

  try {
    action();
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(InvalidMenuPriceError);

  expect((thrownError as InvalidMenuPriceError).code).toBe(
    MENU_PRICE_CODE.AMOUNT_INVALID,
  );
}

describe('BranchMenuItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('should create a branch menu item successfully', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem).toBeInstanceOf(BranchMenuItem);
      expect(branchMenuItem.id).toBe(BRANCH_MENU_ITEM_ID);
      expect(branchMenuItem.organizationId).toBe(ORGANIZATION_ID);
      expect(branchMenuItem.branchId).toBe(BRANCH_ID);
      expect(branchMenuItem.menuItemId).toBe(MENU_ITEM_ID);
    });

    it('should generate an ID when ID is not provided', () => {
      // Arrange
      const input: CreateBranchMenuItemInput = {
        organizationId: ORGANIZATION_ID,
        branchId: BRANCH_ID,
        menuItemId: MENU_ITEM_ID,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.id).toBeTruthy();
      expect(branchMenuItem.id).toBeTypeOf('string');
    });

    it('should reject an empty provided ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        id: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.create(input),
        BRANCH_MENU_ITEM_CODE.ID_REQUIRED,
      );
    });

    it('should trim organization ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        organizationId: `  ${ORGANIZATION_ID}  `,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.organizationId).toBe(ORGANIZATION_ID);
    });

    it('should trim branch ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        branchId: `  ${BRANCH_ID}  `,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.branchId).toBe(BRANCH_ID);
    });

    it('should trim menu item ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        menuItemId: `  ${MENU_ITEM_ID}  `,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.menuItemId).toBe(MENU_ITEM_ID);
    });

    it('should use null as default price override', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.priceOverride).toBeNull();
    });

    it('should create a price override when provided', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        priceOverrideInToman: 350000,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.priceOverride).toBeInstanceOf(MenuPrice);
      expect(branchMenuItem.priceOverride?.value).toBe(350000);
    });

    it('should allow null price override', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        priceOverrideInToman: null,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.priceOverride).toBeNull();
    });

    it('should use zero as default display order', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.displayOrder).toBe(0);
    });

    it('should use provided display order', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        displayOrder: 5,
      };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.displayOrder).toBe(5);
    });

    it('should use ACTIVE status by default', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.ACTIVE);
      expect(branchMenuItem.isActive()).toBe(true);
    });

    it('should use AVAILABLE availability by default', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
      );

      expect(branchMenuItem.isAvailable()).toBe(true);
    });

    it('should initialize createdAt and updatedAt', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const branchMenuItem = BranchMenuItem.create(input);

      // Assert
      expect(branchMenuItem.createdAt).toEqual(
        new Date('2026-01-01T10:00:00.000Z'),
      );

      expect(branchMenuItem.updatedAt).toEqual(branchMenuItem.createdAt);
    });

    it('should reject an empty organization ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        organizationId: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.create(input),
        BRANCH_MENU_ITEM_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject an empty branch ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        branchId: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.create(input),
        BRANCH_MENU_ITEM_CODE.BRANCH_ID_REQUIRED,
      );
    });

    it('should reject an empty menu item ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        menuItemId: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.create(input),
        BRANCH_MENU_ITEM_CODE.MENU_ITEM_ID_REQUIRED,
      );
    });

    it.each([-1, -10, 1.5, NaN, Infinity])(
      'should reject an invalid display order: %s',
      (displayOrder) => {
        // Arrange
        const input = {
          ...validCreateInput,
          displayOrder,
        };

        // Act & Assert
        expectInvalidBranchMenuItemError(
          () => BranchMenuItem.create(input),
          BRANCH_MENU_ITEM_CODE.DISPLAY_ORDER_INVALID,
        );
      },
    );

    it('should propagate MenuPrice error for an invalid price override', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        priceOverrideInToman: -1000,
      };

      // Act & Assert
      expectInvalidMenuPriceError(() => BranchMenuItem.create(input));
    });
  });

  // ---------------------------------------------------------------------------
  // Reconstitute
  // ---------------------------------------------------------------------------

  describe('reconstitute', () => {
    it('should reconstitute a branch menu item successfully', () => {
      // Arrange
      const input = { ...validReconstituteInput };

      // Act
      const branchMenuItem = BranchMenuItem.reconstitute(input);

      // Assert
      expect(branchMenuItem).toBeInstanceOf(BranchMenuItem);
      expect(branchMenuItem.id).toBe(BRANCH_MENU_ITEM_ID);
      expect(branchMenuItem.organizationId).toBe(ORGANIZATION_ID);
      expect(branchMenuItem.branchId).toBe(BRANCH_ID);
      expect(branchMenuItem.menuItemId).toBe(MENU_ITEM_ID);
      expect(branchMenuItem.priceOverride?.value).toBe(350000);
      expect(branchMenuItem.displayOrder).toBe(2);
    });

    it('should reconstitute an item without price override', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        priceOverrideInToman: null,
      };

      // Act
      const branchMenuItem = BranchMenuItem.reconstitute(input);

      // Assert
      expect(branchMenuItem.priceOverride).toBeNull();
    });

    it('should preserve the restored status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
      };

      // Act
      const branchMenuItem = BranchMenuItem.reconstitute(input);

      // Assert
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.INACTIVE);

      expect(branchMenuItem.isInactive()).toBe(true);
    });

    it('should preserve the restored availability', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      };

      // Act
      const branchMenuItem = BranchMenuItem.reconstitute(input);

      // Assert
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      );

      expect(branchMenuItem.isUnavailable()).toBe(true);
    });

    it('should preserve creation and update timestamps', () => {
      // Arrange
      const createdAt = new Date('2025-12-01T10:00:00.000Z');
      const updatedAt = new Date('2025-12-10T12:00:00.000Z');

      const input = {
        ...validReconstituteInput,
        createdAt,
        updatedAt,
      };

      // Act
      const branchMenuItem = BranchMenuItem.reconstitute(input);

      // Assert
      expect(branchMenuItem.createdAt).toEqual(createdAt);
      expect(branchMenuItem.updatedAt).toEqual(updatedAt);
    });

    it('should reject an empty ID', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        id: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.ID_REQUIRED,
      );
    });

    it('should reject an empty organization ID', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        organizationId: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject an empty branch ID', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        branchId: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.BRANCH_ID_REQUIRED,
      );
    });

    it('should reject an empty menu item ID', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        menuItemId: '   ',
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.MENU_ITEM_ID_REQUIRED,
      );
    });

    it.each([-1, 1.5, NaN, Infinity])(
      'should reject an invalid display order: %s',
      (displayOrder) => {
        // Arrange
        const input = {
          ...validReconstituteInput,
          displayOrder,
        };

        // Act & Assert
        expectInvalidBranchMenuItemError(
          () => BranchMenuItem.reconstitute(input),
          BRANCH_MENU_ITEM_CODE.DISPLAY_ORDER_INVALID,
        );
      },
    );

    it('should reject an invalid status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: 'INVALID_STATUS' as BranchMenuItemStatus,
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.STATUS_INVALID,
      );
    });

    it('should reject an invalid availability', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        availability: 'INVALID_AVAILABILITY' as BranchMenuItemAvailability,
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.AVAILABILITY_INVALID,
      );
    });

    it('should reject an invalid createdAt timestamp', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        createdAt: new Date('invalid'),
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should reject an invalid updatedAt timestamp', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        updatedAt: new Date('invalid'),
      };

      // Act & Assert
      expectInvalidBranchMenuItemError(
        () => BranchMenuItem.reconstitute(input),
        BRANCH_MENU_ITEM_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should propagate MenuPrice error for an invalid price override', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        priceOverrideInToman: -1000,
      };

      // Act & Assert
      expectInvalidMenuPriceError(() => BranchMenuItem.reconstitute(input));
    });
  });

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  describe('getters', () => {
    it('should return all branch menu item properties', () => {
      // Arrange
      const input = { ...validReconstituteInput };

      // Act
      const branchMenuItem = BranchMenuItem.reconstitute(input);

      // Assert
      expect(branchMenuItem.id).toBe(BRANCH_MENU_ITEM_ID);
      expect(branchMenuItem.organizationId).toBe(ORGANIZATION_ID);
      expect(branchMenuItem.branchId).toBe(BRANCH_ID);
      expect(branchMenuItem.menuItemId).toBe(MENU_ITEM_ID);
      expect(branchMenuItem.priceOverride?.value).toBe(350000);
      expect(branchMenuItem.displayOrder).toBe(2);
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.ACTIVE);
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
      );
    });

    it('should return a copy of createdAt', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      const createdAt = branchMenuItem.createdAt;
      createdAt.setFullYear(2000);

      // Assert
      expect(branchMenuItem.createdAt).toEqual(
        new Date('2026-01-01T10:00:00.000Z'),
      );
    });

    it('should return a copy of updatedAt', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      const updatedAt = branchMenuItem.updatedAt;
      updatedAt.setFullYear(2000);

      // Assert
      expect(branchMenuItem.updatedAt).toEqual(
        new Date('2026-01-01T10:00:00.000Z'),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Status Checks
  // ---------------------------------------------------------------------------

  describe('status checks', () => {
    it('should identify an active item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act & Assert
      expect(branchMenuItem.isActive()).toBe(true);
      expect(branchMenuItem.isInactive()).toBe(false);
    });

    it('should identify an inactive item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
      });

      // Act & Assert
      expect(branchMenuItem.isActive()).toBe(false);
      expect(branchMenuItem.isInactive()).toBe(true);
    });

    it('should identify an available item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act & Assert
      expect(branchMenuItem.isAvailable()).toBe(true);
      expect(branchMenuItem.isUnavailable()).toBe(false);
    });

    it('should identify an unavailable item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      });

      // Act & Assert
      expect(branchMenuItem.isAvailable()).toBe(false);
      expect(branchMenuItem.isUnavailable()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Change Price Override
  // ---------------------------------------------------------------------------

  describe('changePriceOverride', () => {
    it('should set a price override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      branchMenuItem.changePriceOverride(350000);

      // Assert
      expect(branchMenuItem.priceOverride?.value).toBe(350000);
    });

    it('should replace an existing price override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      // Act
      branchMenuItem.changePriceOverride(400000);

      // Assert
      expect(branchMenuItem.priceOverride?.value).toBe(400000);
    });

    it('should update updatedAt when the price changes', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.changePriceOverride(350000);

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when the price is unchanged', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.changePriceOverride(350000);

      // Assert
      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should reject an invalid price override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      // Act & Assert
      expectInvalidMenuPriceError(() =>
        branchMenuItem.changePriceOverride(-1000),
      );

      expect(branchMenuItem.priceOverride?.value).toBe(350000);
    });
  });

  // ---------------------------------------------------------------------------
  // Clear Price Override
  // ---------------------------------------------------------------------------

  describe('clearPriceOverride', () => {
    it('should clear an existing price override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      // Act
      branchMenuItem.clearPriceOverride();

      // Assert
      expect(branchMenuItem.priceOverride).toBeNull();
    });

    it('should update updatedAt when clearing a price override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.clearPriceOverride();

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when there is no price override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.clearPriceOverride();

      // Assert
      expect(branchMenuItem.priceOverride).toBeNull();
      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // Get Effective Price
  // ---------------------------------------------------------------------------

  describe('getEffectivePrice', () => {
    it('should return the base price when price override is null', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const basePrice = MenuPrice.create(300000);

      // Act
      const effectivePrice = branchMenuItem.getEffectivePrice(basePrice);

      // Assert
      expect(effectivePrice.value).toBe(300000);
    });

    it('should return the override price when it exists', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      const basePrice = MenuPrice.create(300000);

      // Act
      const effectivePrice = branchMenuItem.getEffectivePrice(basePrice);

      // Assert
      expect(effectivePrice.value).toBe(350000);
    });

    it('should return the base price after clearing the override', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
        priceOverrideInToman: 350000,
      });

      const basePrice = MenuPrice.create(300000);

      branchMenuItem.clearPriceOverride();

      // Act
      const effectivePrice = branchMenuItem.getEffectivePrice(basePrice);

      // Assert
      expect(effectivePrice.value).toBe(300000);
    });
  });

  // ---------------------------------------------------------------------------
  // Update Display Order
  // ---------------------------------------------------------------------------

  describe('updateDisplayOrder', () => {
    it('should update display order', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      branchMenuItem.updateDisplayOrder(5);

      // Assert
      expect(branchMenuItem.displayOrder).toBe(5);
    });

    it('should update updatedAt when display order changes', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.updateDisplayOrder(5);

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when display order is unchanged', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      // Act
      branchMenuItem.updateDisplayOrder(0);

      // Assert
      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });

    it.each([-1, -5, 1.5, NaN, Infinity])(
      'should reject an invalid display order: %s',
      (displayOrder) => {
        // Arrange
        const branchMenuItem = BranchMenuItem.create({
          ...validCreateInput,
          displayOrder: 2,
        });

        // Act & Assert
        expectInvalidBranchMenuItemError(
          () => branchMenuItem.updateDisplayOrder(displayOrder),
          BRANCH_MENU_ITEM_CODE.DISPLAY_ORDER_INVALID,
        );

        expect(branchMenuItem.displayOrder).toBe(2);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Activate
  // ---------------------------------------------------------------------------

  describe('activate', () => {
    it('should activate an inactive item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
      });

      // Act
      branchMenuItem.activate();

      // Assert
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.ACTIVE);
      expect(branchMenuItem.isActive()).toBe(true);
    });

    it('should update updatedAt when activating an item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.activate();

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when item is already active', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.activate();

      // Assert
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.ACTIVE);
      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // Deactivate
  // ---------------------------------------------------------------------------

  describe('deactivate', () => {
    it('should deactivate an active item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      branchMenuItem.deactivate();

      // Assert
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.INACTIVE);
      expect(branchMenuItem.isInactive()).toBe(true);
    });

    it('should update updatedAt when deactivating an item', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.deactivate();

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when item is already inactive', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        status: BRANCH_MENU_ITEM_STATUS.INACTIVE,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.deactivate();

      // Assert
      expect(branchMenuItem.status).toBe(BRANCH_MENU_ITEM_STATUS.INACTIVE);
      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // Mark As Available
  // ---------------------------------------------------------------------------

  describe('markAsAvailable', () => {
    it('should mark an unavailable item as available', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      });

      // Act
      branchMenuItem.markAsAvailable();

      // Assert
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
      );

      expect(branchMenuItem.isAvailable()).toBe(true);
    });

    it('should update updatedAt when availability changes', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.markAsAvailable();

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when item is already available', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.markAsAvailable();

      // Assert
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
      );

      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // Mark As Unavailable
  // ---------------------------------------------------------------------------

  describe('markAsUnavailable', () => {
    it('should mark an available item as unavailable', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      branchMenuItem.markAsUnavailable();

      // Assert
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      );

      expect(branchMenuItem.isUnavailable()).toBe(true);
    });

    it('should update updatedAt when availability changes', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.markAsUnavailable();

      // Assert
      expect(branchMenuItem.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when item is already unavailable', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.reconstitute({
        ...validReconstituteInput,
        availability: BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      });

      const previousUpdatedAt = branchMenuItem.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      branchMenuItem.markAsUnavailable();

      // Assert
      expect(branchMenuItem.availability).toBe(
        BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE,
      );

      expect(branchMenuItem.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // Independence of Status and Availability
  // ---------------------------------------------------------------------------

  describe('status and availability independence', () => {
    it('should keep the item active when it becomes unavailable', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      branchMenuItem.markAsUnavailable();

      // Assert
      expect(branchMenuItem.isActive()).toBe(true);
      expect(branchMenuItem.isUnavailable()).toBe(true);
    });

    it('should keep availability unchanged when item is deactivated', () => {
      // Arrange
      const branchMenuItem = BranchMenuItem.create({
        ...validCreateInput,
      });

      // Act
      branchMenuItem.deactivate();

      // Assert
      expect(branchMenuItem.isInactive()).toBe(true);
      expect(branchMenuItem.isAvailable()).toBe(true);
    });
  });
});
