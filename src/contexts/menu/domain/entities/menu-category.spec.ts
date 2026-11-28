import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuCategory } from './menu-category.js';
import type {
  CreateMenuCategoryInput,
  ReconstituteMenuCategoryInput,
} from './menu-category.js';
import {
  InvalidMenuCategoryDataError,
  MENU_CATEGORY_CODE,
} from '../errors/invalid-menu-category.error.js';
import type { MenuCategoryDataErrorCode } from '../errors/invalid-menu-category.error.js';
import {
  MENU_CATEGORY_STATUS,
  type MenuCategoryStatus,
} from '../types/menu-category-status.js';

const CATEGORY_ID = 'e200f3ae-4a3a-4692-a4a3-d45553d622c5';
const ORGANIZATION_ID = 'f19524df-8a26-4115-9731-e32a03ad83a5';

const validCreateInput: CreateMenuCategoryInput = {
  id: CATEGORY_ID,
  organizationId: ORGANIZATION_ID,
  nameFa: 'کباب‌ها',
};

const validReconstituteInput: ReconstituteMenuCategoryInput = {
  id: CATEGORY_ID,
  organizationId: ORGANIZATION_ID,
  nameFa: 'کباب‌ها',
  nameEn: 'Kebabs',
  descriptionFa: 'انواع کباب',
  descriptionEn: 'Different types of kebabs',
  imageId: 'image-123',
  displayOrder: 1,
  status: MENU_CATEGORY_STATUS.ACTIVE,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

function expectInvalidCategoryError(
  action: () => void,
  expectedCode: MenuCategoryDataErrorCode,
): void {
  let thrownError: unknown;

  try {
    action();
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(InvalidMenuCategoryDataError);

  expect((thrownError as InvalidMenuCategoryDataError).code).toBe(expectedCode);
}

describe('MenuCategory', () => {
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
    it('should create a menu category successfully', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category).toBeInstanceOf(MenuCategory);
      expect(category.id).toBe(CATEGORY_ID);
      expect(category.organizationId).toBe(ORGANIZATION_ID);
      expect(category.nameFa).toBe('کباب‌ها');
    });

    it('should generate an ID when ID is not provided', () => {
      // Arrange
      const input: CreateMenuCategoryInput = {
        organizationId: ORGANIZATION_ID,
        nameFa: 'کباب‌ها',
      };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.id).toBeTruthy();
      expect(category.id).toBeTypeOf('string');
    });

    it('should trim organization ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        organizationId: `  ${ORGANIZATION_ID}  `,
      };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.organizationId).toBe(ORGANIZATION_ID);
    });

    it('should trim Persian name', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        nameFa: '  کباب‌ها  ',
      };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.nameFa).toBe('کباب‌ها');
    });

    it('should normalize optional text fields', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        nameEn: '  Kebabs  ',
        descriptionFa: '  انواع کباب  ',
        descriptionEn: '  Different types of kebabs  ',
        imageId: '  image-123  ',
      };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.nameEn).toBe('Kebabs');
      expect(category.descriptionFa).toBe('انواع کباب');
      expect(category.descriptionEn).toBe('Different types of kebabs');
      expect(category.imageId).toBe('image-123');
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
      const category = MenuCategory.create(input);

      // Assert
      expect(category.nameEn).toBeNull();
      expect(category.descriptionFa).toBeNull();
      expect(category.descriptionEn).toBeNull();
      expect(category.imageId).toBeNull();
    });

    it('should use null as default for optional fields', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.nameEn).toBeNull();
      expect(category.descriptionFa).toBeNull();
      expect(category.descriptionEn).toBeNull();
      expect(category.imageId).toBeNull();
    });

    it('should use zero as default display order', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.displayOrder).toBe(0);
    });

    it('should use provided display order', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        displayOrder: 5,
      };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.displayOrder).toBe(5);
    });

    it('should use ACTIVE status by default', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ACTIVE);
      expect(category.isActive()).toBe(true);
    });

    it('should initialize createdAt and updatedAt', () => {
      // Arrange
      const input = { ...validCreateInput };

      // Act
      const category = MenuCategory.create(input);

      // Assert
      expect(category.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));

      expect(category.updatedAt).toEqual(category.createdAt);
    });

    it('should reject an empty organization ID', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        organizationId: '   ',
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.create(input),
        MENU_CATEGORY_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject an empty Persian name', () => {
      // Arrange
      const input = {
        ...validCreateInput,
        nameFa: '   ',
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.create(input),
        MENU_CATEGORY_CODE.NAME_FA_REQUIRED,
      );
    });

    it.each([-1, -10, 1.5, NaN, Infinity])(
      'should reject invalid display order: %s',
      (displayOrder) => {
        // Arrange
        const input = {
          ...validCreateInput,
          displayOrder,
        };

        // Act & Assert
        expectInvalidCategoryError(
          () => MenuCategory.create(input),
          MENU_CATEGORY_CODE.DISPLAY_ORDER_INVALID,
        );
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Reconstitute
  // ---------------------------------------------------------------------------

  describe('reconstitute', () => {
    it('should reconstitute a menu category successfully', () => {
      // Arrange
      const input = { ...validReconstituteInput };

      // Act
      const category = MenuCategory.reconstitute(input);

      // Assert
      expect(category).toBeInstanceOf(MenuCategory);
      expect(category.id).toBe(CATEGORY_ID);
      expect(category.organizationId).toBe(ORGANIZATION_ID);
      expect(category.nameFa).toBe('کباب‌ها');
      expect(category.nameEn).toBe('Kebabs');
      expect(category.descriptionFa).toBe('انواع کباب');
      expect(category.descriptionEn).toBe('Different types of kebabs');
      expect(category.imageId).toBe('image-123');
      expect(category.displayOrder).toBe(1);
    });

    it('should preserve the restored status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.INACTIVE,
      };

      // Act
      const category = MenuCategory.reconstitute(input);

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.INACTIVE);
      expect(category.isInactive()).toBe(true);
    });

    it('should reconstitute an archived category', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.ARCHIVED,
      };

      // Act
      const category = MenuCategory.reconstitute(input);

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ARCHIVED);
      expect(category.isArchived()).toBe(true);
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
      const category = MenuCategory.reconstitute(input);

      // Assert
      expect(category.createdAt).toEqual(createdAt);
      expect(category.updatedAt).toEqual(updatedAt);
    });

    it('should reject an empty ID', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        id: '   ',
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.reconstitute(input),
        MENU_CATEGORY_CODE.ID_REQUIRED,
      );
    });

    it('should reject an empty organization ID', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        organizationId: '   ',
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.reconstitute(input),
        MENU_CATEGORY_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject an empty Persian name', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        nameFa: '   ',
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.reconstitute(input),
        MENU_CATEGORY_CODE.NAME_FA_REQUIRED,
      );
    });

    it.each([-1, 1.5, NaN, Infinity])(
      'should reject invalid display order: %s',
      (displayOrder) => {
        // Arrange
        const input = {
          ...validReconstituteInput,
          displayOrder,
        };

        // Act & Assert
        expectInvalidCategoryError(
          () => MenuCategory.reconstitute(input),
          MENU_CATEGORY_CODE.DISPLAY_ORDER_INVALID,
        );
      },
    );

    it('should reject an invalid status', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: 'INVALID_STATUS' as MenuCategoryStatus,
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.reconstitute(input),
        MENU_CATEGORY_CODE.STATUS_INVALID,
      );
    });

    it('should reject an invalid createdAt timestamp', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        createdAt: new Date('invalid'),
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.reconstitute(input),
        MENU_CATEGORY_CODE.TIMESTAMPS_INVALID,
      );
    });

    it('should reject an invalid updatedAt timestamp', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        updatedAt: new Date('invalid'),
      };

      // Act & Assert
      expectInvalidCategoryError(
        () => MenuCategory.reconstitute(input),
        MENU_CATEGORY_CODE.TIMESTAMPS_INVALID,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  describe('getters', () => {
    it('should return all category properties', () => {
      // Arrange
      const input = { ...validReconstituteInput };

      // Act
      const category = MenuCategory.reconstitute(input);

      // Assert
      expect(category.id).toBe(CATEGORY_ID);
      expect(category.organizationId).toBe(ORGANIZATION_ID);
      expect(category.nameFa).toBe('کباب‌ها');
      expect(category.nameEn).toBe('Kebabs');
      expect(category.descriptionFa).toBe('انواع کباب');
      expect(category.descriptionEn).toBe('Different types of kebabs');
      expect(category.imageId).toBe('image-123');
      expect(category.displayOrder).toBe(1);
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ACTIVE);
    });

    it('should return a copy of createdAt', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      const createdAt = category.createdAt;
      createdAt.setFullYear(2000);

      // Assert
      expect(category.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });

    it('should return a copy of updatedAt', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      const updatedAt = category.updatedAt;
      updatedAt.setFullYear(2000);

      // Assert
      expect(category.updatedAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });
  });

  // ---------------------------------------------------------------------------
  // Status checks
  // ---------------------------------------------------------------------------

  describe('status checks', () => {
    it('should identify an active category', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act & Assert
      expect(category.isActive()).toBe(true);
      expect(category.isInactive()).toBe(false);
      expect(category.isArchived()).toBe(false);
    });

    it('should identify an inactive category', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.INACTIVE,
      };

      const category = MenuCategory.reconstitute(input);

      // Act & Assert
      expect(category.isActive()).toBe(false);
      expect(category.isInactive()).toBe(true);
      expect(category.isArchived()).toBe(false);
    });

    it('should identify an archived category', () => {
      // Arrange
      const input = {
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.ARCHIVED,
      };

      const category = MenuCategory.reconstitute(input);

      // Act & Assert
      expect(category.isActive()).toBe(false);
      expect(category.isInactive()).toBe(false);
      expect(category.isArchived()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('should update all category properties', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      category.update({
        nameFa: 'غذاهای سنتی',
        nameEn: 'Traditional Foods',
        descriptionFa: 'انواع غذاهای سنتی',
        descriptionEn: 'Traditional Iranian foods',
        imageId: 'new-image-123',
        displayOrder: 5,
      });

      // Assert
      expect(category.nameFa).toBe('غذاهای سنتی');
      expect(category.nameEn).toBe('Traditional Foods');
      expect(category.descriptionFa).toBe('انواع غذاهای سنتی');
      expect(category.descriptionEn).toBe('Traditional Iranian foods');
      expect(category.imageId).toBe('new-image-123');
      expect(category.displayOrder).toBe(5);
    });

    it('should update only provided fields', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
      });

      // Act
      category.update({
        nameFa: 'کباب‌های ایرانی',
      });

      // Assert
      expect(category.nameFa).toBe('کباب‌های ایرانی');
      expect(category.nameEn).toBe('Kebabs');
      expect(category.descriptionFa).toBe('انواع کباب');
      expect(category.descriptionEn).toBe('Different types of kebabs');
      expect(category.imageId).toBe('image-123');
      expect(category.displayOrder).toBe(1);
    });

    it('should trim updated text values', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      category.update({
        nameFa: '  کباب‌های ایرانی  ',
        nameEn: '  Iranian Kebabs  ',
        descriptionFa: '  توضیحات جدید  ',
        descriptionEn: '  New description  ',
        imageId: '  new-image  ',
      });

      // Assert
      expect(category.nameFa).toBe('کباب‌های ایرانی');
      expect(category.nameEn).toBe('Iranian Kebabs');
      expect(category.descriptionFa).toBe('توضیحات جدید');
      expect(category.descriptionEn).toBe('New description');
      expect(category.imageId).toBe('new-image');
    });

    it('should allow clearing nullable fields', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
      });

      // Act
      category.update({
        nameEn: null,
        descriptionFa: null,
        descriptionEn: null,
        imageId: null,
      });

      // Assert
      expect(category.nameEn).toBeNull();
      expect(category.descriptionFa).toBeNull();
      expect(category.descriptionEn).toBeNull();
      expect(category.imageId).toBeNull();
    });

    it('should convert empty optional fields to null', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
      });

      // Act
      category.update({
        nameEn: '   ',
        descriptionFa: '   ',
        descriptionEn: '',
        imageId: '   ',
      });

      // Assert
      expect(category.nameEn).toBeNull();
      expect(category.descriptionFa).toBeNull();
      expect(category.descriptionEn).toBeNull();
      expect(category.imageId).toBeNull();
    });

    it('should reject an empty Persian name', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act & Assert
      expectInvalidCategoryError(
        () => category.update({ nameFa: '   ' }),
        MENU_CATEGORY_CODE.NAME_FA_REQUIRED,
      );

      expect(category.nameFa).toBe('کباب‌ها');
    });

    it.each([-1, 1.5, NaN, Infinity])(
      'should reject invalid display order: %s',
      (displayOrder) => {
        // Arrange
        const category = MenuCategory.create({ ...validCreateInput });

        // Act & Assert
        expectInvalidCategoryError(
          () => category.update({ displayOrder }),
          MENU_CATEGORY_CODE.DISPLAY_ORDER_INVALID,
        );

        // Assert: مقدار قبلی نباید تغییر کند
        expect(category.displayOrder).toBe(0);
      },
    );

    it('should not partially update when validation fails', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
      });

      const previousNameFa = category.nameFa;
      const previousNameEn = category.nameEn;
      const previousDisplayOrder = category.displayOrder;
      const previousUpdatedAt = category.updatedAt;

      // Act
      expectInvalidCategoryError(
        () =>
          category.update({
            nameFa: 'غذاهای سنتی',
            nameEn: 'Traditional Foods',
            displayOrder: -1,
          }),
        MENU_CATEGORY_CODE.DISPLAY_ORDER_INVALID,
      );

      // Assert
      expect(category.nameFa).toBe(previousNameFa);
      expect(category.nameEn).toBe(previousNameEn);
      expect(category.displayOrder).toBe(previousDisplayOrder);
      expect(category.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should not update updatedAt when no fields are provided', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.update({});

      // Assert
      expect(category.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should not update updatedAt when values have not changed', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.update({
        nameFa: '  کباب‌ها  ',
        displayOrder: 0,
      });

      // Assert
      expect(category.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when a property changes', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.update({
        nameFa: 'کباب‌های ایرانی',
      });

      // Assert
      expect(category.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not change createdAt during update', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousCreatedAt = category.createdAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.update({
        nameFa: 'کباب‌های ایرانی',
      });

      // Assert
      expect(category.createdAt).toEqual(previousCreatedAt);
    });

    it('should not change organization ID during update', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      category.update({
        nameFa: 'کباب‌های ایرانی',
      });

      // Assert
      expect(category.organizationId).toBe(ORGANIZATION_ID);
    });

    it('should reject updating an archived category', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidCategoryError(
        () => category.update({ nameFa: 'غذاهای جدید' }),
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Activate
  // ---------------------------------------------------------------------------

  describe('activate', () => {
    it('should activate an inactive category', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.INACTIVE,
      });

      // Act
      category.activate();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ACTIVE);
      expect(category.isActive()).toBe(true);
    });

    it('should update updatedAt when activating a category', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.INACTIVE,
      });

      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.activate();

      // Assert
      expect(category.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when category is already active', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.activate();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ACTIVE);
      expect(category.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should reject activating an archived category', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidCategoryError(
        () => category.activate(),
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_ACTIVATED,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Deactivate
  // ---------------------------------------------------------------------------

  describe('deactivate', () => {
    it('should deactivate an active category', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      category.deactivate();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.INACTIVE);
      expect(category.isInactive()).toBe(true);
    });

    it('should update updatedAt when deactivating a category', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.deactivate();

      // Assert
      expect(category.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when category is already inactive', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.INACTIVE,
      });

      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.deactivate();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.INACTIVE);
      expect(category.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should reject deactivating an archived category', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.ARCHIVED,
      });

      // Act & Assert
      expectInvalidCategoryError(
        () => category.deactivate(),
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Archive
  // ---------------------------------------------------------------------------

  describe('archive', () => {
    it('should archive an active category', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      // Act
      category.archive();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ARCHIVED);
      expect(category.isArchived()).toBe(true);
    });

    it('should archive an inactive category', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.INACTIVE,
      });

      // Act
      category.archive();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ARCHIVED);
    });

    it('should update updatedAt when archiving a category', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });
      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.archive();

      // Assert
      expect(category.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('should not update updatedAt when category is already archived', () => {
      // Arrange
      const category = MenuCategory.reconstitute({
        ...validReconstituteInput,
        status: MENU_CATEGORY_STATUS.ARCHIVED,
      });

      const previousUpdatedAt = category.updatedAt;

      vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));

      // Act
      category.archive();

      // Assert
      expect(category.status).toBe(MENU_CATEGORY_STATUS.ARCHIVED);
      expect(category.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should prevent updating a category after archiving', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      category.archive();

      // Act & Assert
      expectInvalidCategoryError(
        () => category.update({ nameFa: 'غذاهای سنتی' }),
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should prevent deactivating a category after archiving', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      category.archive();

      // Act & Assert
      expectInvalidCategoryError(
        () => category.deactivate(),
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
      );
    });

    it('should prevent activating a category after archiving', () => {
      // Arrange
      const category = MenuCategory.create({ ...validCreateInput });

      category.archive();

      // Act & Assert
      expectInvalidCategoryError(
        () => category.activate(),
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_ACTIVATED,
      );
    });
  });
});
