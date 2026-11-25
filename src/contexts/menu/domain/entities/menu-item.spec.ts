import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuItem } from './menu-item.js';
import type {
  CreateMenuItemInput,
  ReconstituteMenuItemInput,
} from './menu-item.js';
import { MenuPrice } from '../value-objects/menu-price.vo.js';
import {
  InvalidMenuItemDataError,
  MENU_ITEM_CODE,
} from '../errors/invalid-menu-item.error.js';
import type { MenuItemDataErrorCode } from '../errors/invalid-menu-item.error.js';
import {
  MENU_ITEM_STATUS,
  type MenuItemStatus,
} from '../types/menu-item-status.js';

const MENU_ITEM_ID = 'e200f3ae-4a3a-4692-a4a3-d45553d622c5';
const ORGANIZATION_ID = 'f19524df-8a26-4115-9731-e32a03ad83a5';
const CATEGORY_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_CATEGORY_ID = 'b2222222-2222-4222-8222-222222222222';
const BASE_PRICE_TOMAN = 50_000;

const validCreateInput: CreateMenuItemInput = {
  id: MENU_ITEM_ID,
  organizationId: ORGANIZATION_ID,
  nameFa: 'کباب کوبیده',
  basePriceInToman: BASE_PRICE_TOMAN,
  categoryIds: [CATEGORY_ID],
};

const validReconstituteInput: ReconstituteMenuItemInput = {
  id: MENU_ITEM_ID,
  organizationId: ORGANIZATION_ID,
  nameFa: 'کباب کوبیده',
  nameEn: 'Koobideh Kebab',
  descriptionFa: 'کباب کوبیده با برنج',
  descriptionEn: 'Koobideh kebab with rice',
  imageId: 'image-123',
  basePriceInToman: BASE_PRICE_TOMAN,
  categoryIds: [CATEGORY_ID],
  status: MENU_ITEM_STATUS.DRAFT,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

function expectInvalidItemError(
  action: () => void,
  expectedCode: MenuItemDataErrorCode,
): void {
  let thrownError: unknown;

  try {
    action();
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(InvalidMenuItemDataError);

  expect((thrownError as InvalidMenuItemDataError).code).toBe(expectedCode);
}

describe('MenuItem', () => {
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
    it('should create a menu item successfully', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item).toBeInstanceOf(MenuItem);
      expect(item.id).toBe(MENU_ITEM_ID);
      expect(item.organizationId).toBe(ORGANIZATION_ID);
      expect(item.nameFa).toBe('کباب کوبیده');
    });

    it('should generate an ID when ID is not provided', () => {
      // Arrange
      const input: CreateMenuItemInput = {
        organizationId: ORGANIZATION_ID,
        nameFa: 'کباب کوبیده',
        basePriceInToman: BASE_PRICE_TOMAN,
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.id).toBeTruthy();
      expect(item.id).toBeTypeOf('string');
    });

    it('should reject an empty provided ID', () => {
      // Arrange
      const input = { ...validCreateInput, id: '   ' };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.create(input),
        MENU_ITEM_CODE.ID_REQUIRED,
      );
    });

    it('should trim organization ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        organizationId: `  ${ORGANIZATION_ID}  `,
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.organizationId).toBe(ORGANIZATION_ID);
    });

    it('should trim Persian name', () => {
      // Arrange
      const input = { ...validCreateInput, nameFa: '  کباب کوبیده  ' };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.nameFa).toBe('کباب کوبیده');
    });

    it('should normalize optional text fields', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        nameEn: '  Koobideh Kebab  ',
        descriptionFa: '  کباب با برنج  ',
        descriptionEn: '  Kebab with rice  ',
        imageId: '  image-123  ',
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.nameEn).toBe('Koobideh Kebab');
      expect(item.descriptionFa).toBe('کباب با برنج');
      expect(item.descriptionEn).toBe('Kebab with rice');
      expect(item.imageId).toBe('image-123');
    });

    it('should convert empty optional fields to null', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        nameEn: '   ',
        descriptionFa: '',
        descriptionEn: '   ',
        imageId: '',
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.nameEn).toBeNull();
      expect(item.descriptionFa).toBeNull();
      expect(item.descriptionEn).toBeNull();
      expect(item.imageId).toBeNull();
    });

    it('should use null as default for optional fields', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.nameEn).toBeNull();
      expect(item.descriptionFa).toBeNull();
      expect(item.descriptionEn).toBeNull();
      expect(item.imageId).toBeNull();
    });

    it('should use empty array as default for categories', () => {
      // Arrange
      const input: CreateMenuItemInput = {
        organizationId: ORGANIZATION_ID,
        nameFa: 'کباب کوبیده',
        basePriceInToman: BASE_PRICE_TOMAN,
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.categoryIds).toEqual([]);
    });

    it('should use DRAFT status by default', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.DRAFT);
      expect(item.isDraft()).toBe(true);
    });

    it('should create the base price from basePriceInToman', () => {
      // Arrange
      const input = { ...validCreateInput, basePriceInToman: 75_000 };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.basePrice).toBeInstanceOf(MenuPrice);
      expect(item.basePrice.equals(MenuPrice.create(75_000))).toBe(true);
    });

    it('should trim each category ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        categoryIds: [`  ${CATEGORY_ID}  `, `  ${OTHER_CATEGORY_ID}  `],
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.categoryIds).toEqual([CATEGORY_ID, OTHER_CATEGORY_ID]);
    });

    it('should allow creating a DRAFT item without categories', () => {
      // Arrange
      const input: CreateMenuItemInput = {
        organizationId: ORGANIZATION_ID,
        nameFa: 'کباب کوبیده',
        basePriceInToman: BASE_PRICE_TOMAN,
      };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.categoryIds).toEqual([]);
      expect(item.isDraft()).toBe(true);
    });

    it('should initialize createdAt and updatedAt', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const item = MenuItem.create(input);

      // Assert
      expect(item.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
      expect(item.updatedAt).toEqual(item.createdAt);
    });

    it('should reject an empty organization ID', () => {
      // Arrange
      const input = { ...validCreateInput, organizationId: '   ' };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.create(input),
        MENU_ITEM_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject an empty Persian name', () => {
      // Arrange
      const input = { ...validCreateInput, nameFa: '   ' };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.create(input),
        MENU_ITEM_CODE.NAME_FA_REQUIRED,
      );
    });

    it('should reject an empty category ID', () => {
      // Arrange
      const input = { ...validCreateInput, categoryIds: ['   '] };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.create(input),
        MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
      );
    });

    it('should reject duplicate category IDs', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        categoryIds: [CATEGORY_ID, CATEGORY_ID],
      };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.create(input),
        MENU_ITEM_CODE.CATEGORY_ID_ALREADY_ASSIGNED,
      );
    });

    it('should propagate MenuPrice errors for an invalid base price', () => {
      // Arrange
      const input = { ...validCreateInput, basePriceInToman: -1 };

      // Act & Assert
      expect(() => MenuItem.create(input)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Reconstitute
  // ---------------------------------------------------------------------------

  describe('reconstitute', () => {
    it('should reconstitute a menu item successfully', () => {
      // Arrange
      const input = { ...validReconstituteInput };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item).toBeInstanceOf(MenuItem);
      expect(item.id).toBe(MENU_ITEM_ID);
      expect(item.organizationId).toBe(ORGANIZATION_ID);
      expect(item.nameFa).toBe('کباب کوبیده');
      expect(item.nameEn).toBe('Koobideh Kebab');
      expect(item.descriptionFa).toBe('کباب کوبیده با برنج');
      expect(item.descriptionEn).toBe('Koobideh kebab with rice');
      expect(item.imageId).toBe('image-123');
      expect(item.basePrice.equals(MenuPrice.create(BASE_PRICE_TOMAN))).toBe(
        true,
      );
      expect(item.categoryIds).toEqual([CATEGORY_ID]);
    });

    it('should preserve the restored DRAFT status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.DRAFT,
      };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.DRAFT);
      expect(item.isDraft()).toBe(true);
    });

    it('should preserve the restored ACTIVE status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
        categoryIds: [CATEGORY_ID],
      };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ACTIVE);
      expect(item.isActive()).toBe(true);
    });

    it('should reconstitute an archived item', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ARCHIVED);
      expect(item.isArchived()).toBe(true);
    });

    it('should accept DRAFT status without categories', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.DRAFT,
        categoryIds: [],
      };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.categoryIds).toEqual([]);
    });

    it('should accept ARCHIVED status without categories', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
        categoryIds: [],
      };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.categoryIds).toEqual([]);
    });

    it('should reject ACTIVE status without categories', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
        categoryIds: [],
      };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.CATEGORY_REQUIRED_FOR_ACTIVE_ITEM,
      );
    });

    it('should preserve creation and update timestamps', () => {
      // Arrange
      const createdAt = new Date('2025-12-01T10:00:00.000Z');
      const updatedAt = new Date('2025-12-10T12:00:00.000Z');
      const input = { ...validReconstituteInput, createdAt, updatedAt };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.createdAt).toEqual(createdAt);
      expect(item.updatedAt).toEqual(updatedAt);
    });

    it('should create the base price from basePriceInToman', () => {
      // Arrange
      const input = { ...validReconstituteInput, basePriceInToman: 88_000 };

      // Act
      const item = MenuItem.reconstitute(input);

      // Assert
      expect(item.basePrice.equals(MenuPrice.create(88_000))).toBe(true);
    });

    it('should reject an empty ID', () => {
      // Arrange
      const input = { ...validReconstituteInput, id: '   ' };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.ID_REQUIRED,
      );
    });

    it('should reject an empty organization ID', () => {
      // Arrange
      const input = { ...validReconstituteInput, organizationId: '   ' };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject an empty Persian name', () => {
      // Arrange
      const input = { ...validReconstituteInput, nameFa: '   ' };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.NAME_FA_REQUIRED,
      );
    });

    it('should reject an empty category ID', () => {
      // Arrange
      const input = { ...validReconstituteInput, categoryIds: ['   '] };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
      );
    });

    it('should reject duplicate category IDs', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        categoryIds: [CATEGORY_ID, CATEGORY_ID],
      };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.CATEGORY_ID_ALREADY_ASSIGNED,
      );
    });

    it('should reject an invalid status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: 'INVALID_STATUS' as MenuItemStatus,
      };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.STATUS_INVALID,
      );
    });

    it('should reject an invalid createdAt timestamp', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        createdAt: new Date('invalid'),
      };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should reject an invalid updatedAt timestamp', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        updatedAt: new Date('invalid'),
      };

      // Act & Assert
      expectInvalidItemError(
        () => MenuItem.reconstitute(input),
        MENU_ITEM_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should propagate MenuPrice errors for an invalid base price', () => {
      // Arrange
      const input = { ...validReconstituteInput, basePriceInToman: -1 };

      // Act & Assert
      expect(() => MenuItem.reconstitute(input)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  describe('getters', () => {
    it('should return all item properties', () => {
      // Arrange
      const item = MenuItem.reconstitute({ ...validReconstituteInput });

      // Act & Assert
      expect(item.id).toBe(MENU_ITEM_ID);
      expect(item.organizationId).toBe(ORGANIZATION_ID);
      expect(item.nameFa).toBe('کباب کوبیده');
      expect(item.nameEn).toBe('Koobideh Kebab');
      expect(item.descriptionFa).toBe('کباب کوبیده با برنج');
      expect(item.descriptionEn).toBe('Koobideh kebab with rice');
      expect(item.imageId).toBe('image-123');
      expect(item.categoryIds).toEqual([CATEGORY_ID]);
      expect(item.status).toBe(MENU_ITEM_STATUS.DRAFT);
      expect(item.basePrice).toBeInstanceOf(MenuPrice);
    });

    it('should return a copy of createdAt', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      const createdAt = item.createdAt;
      createdAt.setFullYear(2000);

      // Assert
      expect(item.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });

    it('should return a copy of updatedAt', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      const updatedAt = item.updatedAt;
      updatedAt.setFullYear(2000);

      // Assert
      expect(item.updatedAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });

    it('should return a copy of categoryIds', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      const ids = item.categoryIds;
      ids.push(OTHER_CATEGORY_ID);

      // Assert
      expect(item.categoryIds).toEqual([CATEGORY_ID]);
    });
  });

  // ---------------------------------------------------------------------------
  // Status checks
  // ---------------------------------------------------------------------------

  describe('status checks', () => {
    it('should identify a draft item', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expect(item.isDraft()).toBe(true);
      expect(item.isActive()).toBe(false);
      expect(item.isArchived()).toBe(false);
    });

    it('should identify an active item', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
      };
      const item = MenuItem.reconstitute(input);

      // Act & Assert
      expect(item.isDraft()).toBe(false);
      expect(item.isActive()).toBe(true);
      expect(item.isArchived()).toBe(false);
    });

    it('should identify an archived item', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      };
      const item = MenuItem.reconstitute(input);

      // Act & Assert
      expect(item.isDraft()).toBe(false);
      expect(item.isActive()).toBe(false);
      expect(item.isArchived()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('should update all provided fields', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.update({
        nameFa: 'کباب برگ',
        nameEn: 'Barg Kebab',
        descriptionFa: 'کباب برگ با برنج',
        descriptionEn: 'Barg kebab with rice',
        imageId: 'new-image-123',
      });

      // Assert
      expect(item.nameFa).toBe('کباب برگ');
      expect(item.nameEn).toBe('Barg Kebab');
      expect(item.descriptionFa).toBe('کباب برگ با برنج');
      expect(item.descriptionEn).toBe('Barg kebab with rice');
      expect(item.imageId).toBe('new-image-123');
    });

    it('should update only provided fields', () => {
      // Arrange
      const item = MenuItem.reconstitute({ ...validReconstituteInput });

      // Act
      item.update({ nameFa: 'کباب برگ' });

      // Assert
      expect(item.nameFa).toBe('کباب برگ');
      expect(item.nameEn).toBe('Koobideh Kebab');
      expect(item.descriptionFa).toBe('کباب کوبیده با برنج');
      expect(item.descriptionEn).toBe('Koobideh kebab with rice');
      expect(item.imageId).toBe('image-123');
    });

    it('should trim updated text values', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.update({
        nameFa: '  کباب برگ  ',
        nameEn: '  Barg Kebab  ',
        descriptionFa: '  توضیحات جدید  ',
        descriptionEn: '  New description  ',
        imageId: '  new-image  ',
      });

      // Assert
      expect(item.nameFa).toBe('کباب برگ');
      expect(item.nameEn).toBe('Barg Kebab');
      expect(item.descriptionFa).toBe('توضیحات جدید');
      expect(item.descriptionEn).toBe('New description');
      expect(item.imageId).toBe('new-image');
    });

    it('should allow clearing nullable fields', () => {
      // Arrange
      const item = MenuItem.reconstitute({ ...validReconstituteInput });

      // Act
      item.update({
        nameEn: null,
        descriptionFa: null,
        descriptionEn: null,
        imageId: null,
      });

      // Assert
      expect(item.nameEn).toBeNull();
      expect(item.descriptionFa).toBeNull();
      expect(item.descriptionEn).toBeNull();
      expect(item.imageId).toBeNull();
    });

    it('should convert empty optional fields to null', () => {
      // Arrange
      const item = MenuItem.reconstitute({ ...validReconstituteInput });

      // Act
      item.update({
        nameEn: '   ',
        descriptionFa: '   ',
        descriptionEn: '',
        imageId: '   ',
      });

      // Assert
      expect(item.nameEn).toBeNull();
      expect(item.descriptionFa).toBeNull();
      expect(item.descriptionEn).toBeNull();
      expect(item.imageId).toBeNull();
    });

    it('should reject an empty Persian name', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expectInvalidItemError(
        () => item.update({ nameFa: '   ' }),
        MENU_ITEM_CODE.NAME_FA_REQUIRED,
      );

      expect(item.nameFa).toBe('کباب کوبیده');
    });

    it('should not partially update when name validation fails', () => {
      // Arrange
      const item = MenuItem.reconstitute({ ...validReconstituteInput });
      const previousNameFa = item.nameFa;
      const previousNameEn = item.nameEn;
      const previousUpdatedAt = item.updatedAt;

      // Act
      expectInvalidItemError(
        () => item.update({ nameFa: '   ', nameEn: 'New name' }),
        MENU_ITEM_CODE.NAME_FA_REQUIRED,
      );

      // Assert
      expect(item.nameFa).toBe(previousNameFa);
      expect(item.nameEn).toBe(previousNameEn);
      expect(item.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should not update updatedAt when no fields are provided', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.update({});

      // Assert
      expect(item.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should not update updatedAt when values have not changed', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.update({ nameFa: '  کباب کوبیده  ' });

      // Assert
      expect(item.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when a property changes', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.update({ nameFa: 'کباب برگ' });

      // Assert
      expect(item.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not change createdAt during update', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousCreatedAt = item.createdAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.update({ nameFa: 'کباب برگ' });

      // Assert
      expect(item.createdAt).toEqual(previousCreatedAt);
    });

    it('should not change organization ID during update', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.update({ nameFa: 'کباب برگ' });

      // Assert
      expect(item.organizationId).toBe(ORGANIZATION_ID);
    });

    it('should reject updating an archived item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.update({ nameFa: 'کباب برگ' }),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // changeBasePrice
  // ---------------------------------------------------------------------------

  describe('changeBasePrice', () => {
    it('should change the base price', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.changeBasePrice(75_000);

      // Assert
      expect(item.basePrice.equals(MenuPrice.create(75_000))).toBe(true);
    });

    it('should update updatedAt when the price changes', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.changeBasePrice(75_000);

      // Assert
      expect(item.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when the price is unchanged', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.changeBasePrice(BASE_PRICE_TOMAN);

      // Assert
      expect(item.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should propagate MenuPrice errors for an invalid amount', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expect(() => item.changeBasePrice(-1)).toThrow();
      expect(item.basePrice.equals(MenuPrice.create(BASE_PRICE_TOMAN))).toBe(
        true,
      );
    });

    it('should reject changing the price of an archived item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.changeBasePrice(75_000),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should not modify the price when archived guard throws', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });

      // Act
      try {
        item.changeBasePrice(75_000);
      } catch {
        // ignore
      }

      // Assert
      expect(item.basePrice.equals(MenuPrice.create(BASE_PRICE_TOMAN))).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // addCategory
  // ---------------------------------------------------------------------------

  describe('addCategory', () => {
    it('should add a category', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.addCategory(OTHER_CATEGORY_ID);

      // Assert
      expect(item.categoryIds).toEqual([CATEGORY_ID, OTHER_CATEGORY_ID]);
    });

    it('should trim the category ID before storing it', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.addCategory(`  ${OTHER_CATEGORY_ID}  `);

      // Assert
      expect(item.categoryIds).toContain(OTHER_CATEGORY_ID);
    });

    it('should update updatedAt when a category is added', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.addCategory(OTHER_CATEGORY_ID);

      // Assert
      expect(item.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should reject an empty category ID', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expectInvalidItemError(
        () => item.addCategory('   '),
        MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
      );
      expect(item.categoryIds).toEqual([CATEGORY_ID]);
    });

    it('should reject a category that is already assigned', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expectInvalidItemError(
        () => item.addCategory(CATEGORY_ID),
        MENU_ITEM_CODE.CATEGORY_ID_ALREADY_ASSIGNED,
      );
    });

    it('should reject adding a category to an archived item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.addCategory(OTHER_CATEGORY_ID),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should not modify state when the archived guard throws', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });

      // Act
      try {
        item.addCategory(OTHER_CATEGORY_ID);
      } catch {
        // ignore
      }

      // Assert
      expect(item.categoryIds).toEqual([CATEGORY_ID]);
    });
  });

  // ---------------------------------------------------------------------------
  // removeCategory
  // ---------------------------------------------------------------------------

  describe('removeCategory', () => {
    it('should remove an existing category', () => {
      // Arrange
      const item = MenuItem.create({
        ...validCreateInput,
        categoryIds: [CATEGORY_ID, OTHER_CATEGORY_ID],
      });

      // Act
      item.removeCategory(CATEGORY_ID);

      // Assert
      expect(item.categoryIds).toEqual([OTHER_CATEGORY_ID]);
    });

    it('should trim the category ID before lookup', () => {
      // Arrange
      const item = MenuItem.create({
        ...validCreateInput,
        categoryIds: [CATEGORY_ID, OTHER_CATEGORY_ID],
      });

      // Act
      item.removeCategory(`  ${CATEGORY_ID}  `);

      // Assert
      expect(item.categoryIds).toEqual([OTHER_CATEGORY_ID]);
    });

    it('should update updatedAt when a category is removed', () => {
      // Arrange
      const item = MenuItem.create({
        ...validCreateInput,
        categoryIds: [CATEGORY_ID, OTHER_CATEGORY_ID],
      });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.removeCategory(CATEGORY_ID);

      // Assert
      expect(item.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should allow removing the last category from a DRAFT item', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.removeCategory(CATEGORY_ID);

      // Assert
      expect(item.categoryIds).toEqual([]);
      expect(item.isDraft()).toBe(true);
    });

    it('should allow removing one of several categories from an ACTIVE item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
        categoryIds: [CATEGORY_ID, OTHER_CATEGORY_ID],
      });

      // Act
      item.removeCategory(CATEGORY_ID);

      // Assert
      expect(item.categoryIds).toEqual([OTHER_CATEGORY_ID]);
    });

    it('should reject removing the last category from an ACTIVE item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
        categoryIds: [CATEGORY_ID],
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.removeCategory(CATEGORY_ID),
        MENU_ITEM_CODE.CATEGORY_REQUIRED_FOR_ACTIVE_ITEM,
      );
      expect(item.categoryIds).toEqual([CATEGORY_ID]);
    });

    it('should reject an empty category ID', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expectInvalidItemError(
        () => item.removeCategory('   '),
        MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
      );
    });

    it('should reject a category that is not assigned', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act & Assert
      expectInvalidItemError(
        () => item.removeCategory(OTHER_CATEGORY_ID),
        MENU_ITEM_CODE.CATEGORY_ID_NOT_ASSIGNED,
      );
    });

    it('should reject removing a category from an archived item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
        categoryIds: [CATEGORY_ID, OTHER_CATEGORY_ID],
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.removeCategory(CATEGORY_ID),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should not modify state when the archived guard throws', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
        categoryIds: [CATEGORY_ID, OTHER_CATEGORY_ID],
      });

      // Act
      try {
        item.removeCategory(CATEGORY_ID);
      } catch {
        // ignore
      }

      // Assert
      expect(item.categoryIds).toEqual([CATEGORY_ID, OTHER_CATEGORY_ID]);
    });
  });

  // ---------------------------------------------------------------------------
  // Activate
  // ---------------------------------------------------------------------------

  describe('activate', () => {
    it('should activate a DRAFT item with categories', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.activate();

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ACTIVE);
      expect(item.isActive()).toBe(true);
    });

    it('should update updatedAt when activating an item', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.activate();

      // Assert
      expect(item.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when the item is already active', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
      });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.activate();

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ACTIVE);
      expect(item.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should reject activating an item with no categories', () => {
      // Arrange
      const item = MenuItem.create({
        ...validCreateInput,
        categoryIds: [],
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.activate(),
        MENU_ITEM_CODE.CATEGORY_REQUIRED_FOR_ACTIVATION,
      );
      expect(item.isDraft()).toBe(true);
    });

    it('should reject activating an archived item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidItemError(
        () => item.activate(),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_ACTIVATED,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Archive
  // ---------------------------------------------------------------------------

  describe('archive', () => {
    it('should archive a DRAFT item', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });

      // Act
      item.archive();

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ARCHIVED);
      expect(item.isArchived()).toBe(true);
    });

    it('should archive an ACTIVE item', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ACTIVE,
      });

      // Act
      item.archive();

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ARCHIVED);
    });

    it('should update updatedAt when archiving an item', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.archive();

      // Assert
      expect(item.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when the item is already archived', () => {
      // Arrange
      const item = MenuItem.reconstitute({
        ...validReconstituteInput,
        status: MENU_ITEM_STATUS.ARCHIVED,
      });
      const previousUpdatedAt = item.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      item.archive();

      // Assert
      expect(item.status).toBe(MENU_ITEM_STATUS.ARCHIVED);
      expect(item.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should prevent updating an item after archiving', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      item.archive();

      // Act & Assert
      expectInvalidItemError(
        () => item.update({ nameFa: 'کباب برگ' }),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should prevent changing the price after archiving', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      item.archive();

      // Act & Assert
      expectInvalidItemError(
        () => item.changeBasePrice(99_000),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should prevent adding a category after archiving', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      item.archive();

      // Act & Assert
      expectInvalidItemError(
        () => item.addCategory(OTHER_CATEGORY_ID),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should prevent removing a category after archiving', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      item.archive();

      // Act & Assert
      expectInvalidItemError(
        () => item.removeCategory(CATEGORY_ID),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should prevent activating an item after archiving', () => {
      // Arrange
      const item = MenuItem.create({ ...validCreateInput });
      item.archive();

      // Act & Assert
      expectInvalidItemError(
        () => item.activate(),
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_ACTIVATED,
      );
    });
  });
});
