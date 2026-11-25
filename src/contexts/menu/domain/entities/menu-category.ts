import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  InvalidMenuCategoryDataError,
  MENU_CATEGORY_CODE,
} from '../errors/invalid-menu-category.error.js';
import {
  MENU_CATEGORY_STATUS,
  type MenuCategoryStatus,
} from '../types/menu-category-status.js';

export interface MenuCategoryProps {
  id: UniqueId;
  organizationId: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  descriptionEn: string | null;
  imageId: string | null;
  displayOrder: number;
  status: MenuCategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMenuCategoryInput {
  id?: string;
  organizationId: string;
  nameFa: string;
  nameEn?: string | null;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  imageId?: string | null;
  displayOrder?: number;
}

export interface ReconstituteMenuCategoryInput {
  id: string;
  organizationId: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  descriptionEn: string | null;
  imageId: string | null;
  displayOrder: number;
  status: MenuCategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateMenuCategoryInput {
  nameFa?: string;
  nameEn?: string | null;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  imageId?: string | null;
  displayOrder?: number;
}

export class MenuCategory extends Entity<UniqueId> {
  private readonly _id: UniqueId;
  private readonly _organizationId: string;
  private _nameFa: string;
  private _nameEn: string | null;
  private _descriptionFa: string | null;
  private _descriptionEn: string | null;
  private _imageId: string | null;
  private _displayOrder: number;
  private _status: MenuCategoryStatus;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: MenuCategoryProps) {
    super(props.id);
    this._id = props.id;
    this._organizationId = props.organizationId;
    this._nameFa = props.nameFa;
    this._nameEn = props.nameEn;
    this._descriptionFa = props.descriptionFa;
    this._descriptionEn = props.descriptionEn;
    this._imageId = props.imageId;
    this._displayOrder = props.displayOrder;
    this._status = props.status;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // create menu-category
  static create(input: CreateMenuCategoryInput): MenuCategory {
    const now = new Date();

    const props: MenuCategoryProps = {
      id: new UniqueId(input.id),
      organizationId: input.organizationId.trim(),
      nameFa: input.nameFa.trim(),
      nameEn: this.normalizeOptionalText(input.nameEn),
      descriptionFa: this.normalizeOptionalText(input.descriptionFa),
      descriptionEn: this.normalizeOptionalText(input.descriptionEn),
      imageId: this.normalizeOptionalText(input.imageId),
      displayOrder: input.displayOrder ?? 0,
      status: MENU_CATEGORY_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };

    this.validate(props);

    return new MenuCategory(props);
  }

  // reconstitute
  static reconstitute(input: ReconstituteMenuCategoryInput): MenuCategory {
    if (!input.id?.trim()) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.ID_REQUIRED,
        'Menu category ID is required.',
      );
    }

    const props: MenuCategoryProps = {
      ...input,
      id: new UniqueId(input.id),
    };

    this.validate(props);

    return new MenuCategory(props);
  }

  private static validate(props: MenuCategoryProps): void {
    if (!props.organizationId.trim()) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.ORGANIZATION_ID_REQUIRED,
        'Organization ID is required.',
      );
    }

    if (!props.nameFa.trim()) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.NAME_FA_REQUIRED,
        'Persian name is required.',
      );
    }
    if (!Number.isInteger(props.displayOrder) || props.displayOrder < 0) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.DISPLAY_ORDER_INVALID,
        'Display order must be a non-negative integer.',
      );
    }

    if (!Object.values(MENU_CATEGORY_STATUS).includes(props.status)) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.STATUS_INVALID,
        'Menu category status is invalid.',
      );
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime()) ||
      !(props.updatedAt instanceof Date) ||
      Number.isNaN(props.updatedAt.getTime())
    ) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.TIMESTAMPS_INVALID,
        'Menu category timestamps are invalid.',
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
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_MODIFIED,
        'Archived menu categories cannot be modified.',
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

  get displayOrder(): number {
    return this._displayOrder;
  }

  get status(): MenuCategoryStatus {
    return this._status;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  // Status checks
  isActive(): boolean {
    return this._status === MENU_CATEGORY_STATUS.ACTIVE;
  }
  isInactive(): boolean {
    return this._status === MENU_CATEGORY_STATUS.INACTIVE;
  }
  isArchived(): boolean {
    return this._status === MENU_CATEGORY_STATUS.ARCHIVED;
  }

  // Behaviors

  update(input: UpdateMenuCategoryInput): void {
    this.assertNotArchived();

    const nameFa =
      input.nameFa === undefined
        ? this._nameFa
        : MenuCategory.normalizeOptionalText(input.nameFa);

    if (!nameFa) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.NAME_FA_REQUIRED,
        'Persian name is required.',
      );
    }

    const nameEn =
      input.nameEn === undefined
        ? this._nameEn
        : MenuCategory.normalizeOptionalText(input.nameEn);

    const descriptionFa =
      input.descriptionFa === undefined
        ? this._descriptionFa
        : MenuCategory.normalizeOptionalText(input.descriptionFa);

    const descriptionEn =
      input.descriptionEn === undefined
        ? this._descriptionEn
        : MenuCategory.normalizeOptionalText(input.descriptionEn);

    const imageId =
      input.imageId === undefined
        ? this._imageId
        : MenuCategory.normalizeOptionalText(input.imageId);

    const displayOrder =
      input.displayOrder === undefined
        ? this._displayOrder
        : input.displayOrder;

    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.DISPLAY_ORDER_INVALID,
        'Display order must be a non-negative integer.',
      );
    }

    const hasChanges =
      nameFa !== this._nameFa ||
      nameEn !== this._nameEn ||
      descriptionFa !== this._descriptionFa ||
      descriptionEn !== this._descriptionEn ||
      imageId !== this._imageId ||
      displayOrder !== this._displayOrder;

    if (!hasChanges) {
      return;
    }

    this._nameFa = nameFa;
    this._nameEn = nameEn;
    this._descriptionFa = descriptionFa;
    this._descriptionEn = descriptionEn;
    this._imageId = imageId;
    this._displayOrder = displayOrder;

    this.touch();
  }

  activate(): void {
    if (this.isArchived()) {
      throw new InvalidMenuCategoryDataError(
        MENU_CATEGORY_CODE.ARCHIVED_CANNOT_BE_ACTIVATED,
        'Archived menu categories cannot be activated.',
      );
    }

    if (this.isActive()) {
      return;
    }

    this._status = MENU_CATEGORY_STATUS.ACTIVE;
    this.touch();
  }

  deactivate(): void {
    this.assertNotArchived();

    if (this.isInactive()) {
      return;
    }

    this._status = MENU_CATEGORY_STATUS.INACTIVE;
    this.touch();
  }

  archive(): void {
    if (this.isArchived()) {
      return;
    }

    this._status = MENU_CATEGORY_STATUS.ARCHIVED;
    this.touch();
  }
}
