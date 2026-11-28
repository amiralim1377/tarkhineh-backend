import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import { MenuPrice } from '../value-objects/menu-price.vo.js';
import {
  MENU_ITEM_STATUS,
  type MenuItemStatus,
} from '../types/menu-item-status.js';
import {
  InvalidMenuItemDataError,
  MENU_ITEM_CODE,
} from '../errors/invalid-menu-item.error.js';

export interface MenuItemProps {
  id: UniqueId;
  organizationId: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  descriptionEn: string | null;
  imageId: string | null;
  basePrice: MenuPrice;
  categoryIds: string[];
  status: MenuItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMenuItemInput {
  id?: string;
  organizationId: string;
  nameFa: string;
  nameEn?: string | null;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  imageId?: string | null;
  basePriceInToman: number;
  categoryIds?: string[];
}

export interface ReconstituteMenuItemInput {
  id: string;
  organizationId: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  descriptionEn: string | null;
  imageId: string | null;
  basePriceInToman: number;
  categoryIds: string[];
  status: MenuItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateMenuItemInput {
  nameFa?: string;
  nameEn?: string | null;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  imageId?: string | null;
}

export class MenuItem extends Entity<UniqueId> {
  private readonly _id: UniqueId;
  private readonly _organizationId: string;
  private _nameFa: string;
  private _nameEn: string | null;
  private _descriptionFa: string | null;
  private _descriptionEn: string | null;
  private _imageId: string | null;
  private _basePrice: MenuPrice;
  private _categoryIds: string[];
  private _status: MenuItemStatus;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: MenuItemProps) {
    super(props.id);
    this._id = props.id;
    this._organizationId = props.organizationId;
    this._nameFa = props.nameFa;
    this._nameEn = props.nameEn;
    this._descriptionFa = props.descriptionFa;
    this._descriptionEn = props.descriptionEn;
    this._imageId = props.imageId;
    this._basePrice = props.basePrice;
    this._categoryIds = [...props.categoryIds];
    this._status = props.status;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // Create

  static create(input: CreateMenuItemInput): MenuItem {
    if (input.id !== undefined && !input.id.trim()) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.ID_REQUIRED,
        'Menu item ID cannot be empty.',
      );
    }

    const now = new Date();

    const props: MenuItemProps = {
      id: new UniqueId(input.id),
      organizationId: input.organizationId.trim(),
      nameFa: input.nameFa.trim(),
      nameEn: this.normalizeOptionalText(input.nameEn),
      descriptionFa: this.normalizeOptionalText(input.descriptionFa),
      descriptionEn: this.normalizeOptionalText(input.descriptionEn),
      imageId: this.normalizeOptionalText(input.imageId),
      basePrice: MenuPrice.create(input.basePriceInToman),
      categoryIds: (input.categoryIds ?? []).map((id) => id.trim()),
      status: MENU_ITEM_STATUS.DRAFT,
      createdAt: now,
      updatedAt: now,
    };

    this.validate(props);

    return new MenuItem(props);
  }

  // Reconstitute
  static reconstitute(input: ReconstituteMenuItemInput): MenuItem {
    if (!input.id?.trim()) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.ID_REQUIRED,
        'Menu item ID is required.',
      );
    }

    const props: MenuItemProps = {
      id: new UniqueId(input.id),
      organizationId: input.organizationId.trim(),
      nameFa: input.nameFa.trim(),
      nameEn: this.normalizeOptionalText(input.nameEn),
      descriptionFa: this.normalizeOptionalText(input.descriptionFa),
      descriptionEn: this.normalizeOptionalText(input.descriptionEn),
      imageId: this.normalizeOptionalText(input.imageId),
      basePrice: MenuPrice.create(input.basePriceInToman),
      categoryIds: [...input.categoryIds].map((id) => id.trim()),
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };

    this.validate(props);

    return new MenuItem(props);
  }

  // Validation

  private static validate(props: MenuItemProps): void {
    if (!props.organizationId.trim()) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.ORGANIZATION_ID_REQUIRED,
        'Organization ID is required.',
      );
    }

    if (!props.nameFa.trim()) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.NAME_FA_REQUIRED,
        'Persian name is required.',
      );
    }

    if (!(props.basePrice instanceof MenuPrice)) {
      throw new TypeError('Menu item base price must be a MenuPrice.');
    }

    for (const categoryId of props.categoryIds) {
      if (!categoryId.trim()) {
        throw new InvalidMenuItemDataError(
          MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
          'Category ID is required.',
        );
      }
    }

    if (new Set(props.categoryIds).size !== props.categoryIds.length) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_ID_ALREADY_ASSIGNED,
        'Duplicate category IDs are not allowed.',
      );
    }

    if (!Object.values(MENU_ITEM_STATUS).includes(props.status)) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.STATUS_INVALID,
        'Menu item status is invalid.',
      );
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime()) ||
      !(props.updatedAt instanceof Date) ||
      Number.isNaN(props.updatedAt.getTime())
    ) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.TIMESTAMPS_INVALID,
        'Menu item timestamps are invalid.',
      );
    }

    if (
      props.status === MENU_ITEM_STATUS.ACTIVE &&
      props.categoryIds.length === 0
    ) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_REQUIRED_FOR_ACTIVE_ITEM,
        'Active menu item must have at least one category.',
      );
    }
  }

  private static normalizeOptionalText(value?: string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
  }

  private assertNotArchived(): void {
    if (this.isArchived()) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
        'Archived menu item cannot be modified.',
      );
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  // Getters

  get id(): string {
    return this._id.getValue();
  }

  get organizationId(): string {
    return this._organizationId;
  }

  get nameFa(): string {
    return this._nameFa;
  }

  get nameEn(): string | null {
    return this._nameEn;
  }

  get descriptionFa(): string | null {
    return this._descriptionFa;
  }

  get descriptionEn(): string | null {
    return this._descriptionEn;
  }

  get imageId(): string | null {
    return this._imageId;
  }

  get basePrice(): MenuPrice {
    return this._basePrice;
  }

  get categoryIds(): string[] {
    return [...this._categoryIds];
  }

  get status(): MenuItemStatus {
    return this._status;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  // Status Checks

  isDraft(): boolean {
    return this._status === MENU_ITEM_STATUS.DRAFT;
  }

  isActive(): boolean {
    return this._status === MENU_ITEM_STATUS.ACTIVE;
  }

  isArchived(): boolean {
    return this._status === MENU_ITEM_STATUS.ARCHIVED;
  }

  // Behaviors

  update(input: UpdateMenuItemInput): void {
    this.assertNotArchived();

    const nameFa =
      input.nameFa === undefined
        ? this._nameFa
        : MenuItem.normalizeOptionalText(input.nameFa);

    if (!nameFa) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.NAME_FA_REQUIRED,
        'Persian name is required.',
      );
    }

    const nameEn =
      input.nameEn === undefined
        ? this._nameEn
        : MenuItem.normalizeOptionalText(input.nameEn);

    const descriptionFa =
      input.descriptionFa === undefined
        ? this._descriptionFa
        : MenuItem.normalizeOptionalText(input.descriptionFa);

    const descriptionEn =
      input.descriptionEn === undefined
        ? this._descriptionEn
        : MenuItem.normalizeOptionalText(input.descriptionEn);

    const imageId =
      input.imageId === undefined
        ? this._imageId
        : MenuItem.normalizeOptionalText(input.imageId);

    const hasChanges =
      nameFa !== this._nameFa ||
      nameEn !== this._nameEn ||
      descriptionFa !== this._descriptionFa ||
      descriptionEn !== this._descriptionEn ||
      imageId !== this._imageId;

    if (!hasChanges) {
      return;
    }

    this._nameFa = nameFa;
    this._nameEn = nameEn;
    this._descriptionFa = descriptionFa;
    this._descriptionEn = descriptionEn;
    this._imageId = imageId;

    this.touch();
  }

  changeBasePrice(amountInToman: number): void {
    this.assertNotArchived();

    const newPrice = MenuPrice.create(amountInToman);

    if (this._basePrice.equals(newPrice)) {
      return;
    }

    this._basePrice = newPrice;

    this.touch();
  }

  addCategory(categoryId: string): void {
    this.assertNotArchived();

    const normalizedCategoryId = categoryId.trim();

    if (!normalizedCategoryId) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
        'Category ID is required.',
      );
    }

    if (this._categoryIds.includes(normalizedCategoryId)) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_ID_ALREADY_ASSIGNED,
        'Category is already assigned to this menu item.',
      );
    }

    this._categoryIds.push(normalizedCategoryId);

    this.touch();
  }

  removeCategory(categoryId: string): void {
    this.assertNotArchived();

    const normalizedCategoryId = categoryId.trim();

    if (!normalizedCategoryId) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_ID_REQUIRED,
        'Category ID is required.',
      );
    }

    const categoryIndex = this._categoryIds.indexOf(normalizedCategoryId);

    if (categoryIndex === -1) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_ID_NOT_ASSIGNED,
        'Category is not assigned to this menu item.',
      );
    }

    if (this.isActive() && this._categoryIds.length === 1) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_REQUIRED_FOR_ACTIVE_ITEM,
        'An active menu item must have at least one category.',
      );
    }

    this._categoryIds.splice(categoryIndex, 1);

    this.touch();
  }

  activate(): void {
    if (this.isArchived()) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.ARCHIVED_CANNOT_BE_ACTIVATED,
        'Archived menu item cannot be activated.',
      );
    }

    if (this.isActive()) {
      return;
    }

    if (this._categoryIds.length === 0) {
      throw new InvalidMenuItemDataError(
        MENU_ITEM_CODE.CATEGORY_REQUIRED_FOR_ACTIVATION,
        'Menu item must have at least one category before activation.',
      );
    }

    this._status = MENU_ITEM_STATUS.ACTIVE;

    this.touch();
  }

  archive(): void {
    if (this.isArchived()) {
      return;
    }

    this._status = MENU_ITEM_STATUS.ARCHIVED;

    this.touch();
  }
}
