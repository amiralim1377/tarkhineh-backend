import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import { MenuPrice } from '../value-objects/menu-price.vo.js';
import {
  BRANCH_MENU_ITEM_STATUS,
  type BranchMenuItemStatus,
} from '../types/branch-menu-item-status.js';
import {
  BRANCH_MENU_ITEM_AVAILABILITY,
  type BranchMenuItemAvailability,
} from '../types/branch-menu-item-availability.js';
import {
  InvalidBranchMenuItemDataError,
  BRANCH_MENU_ITEM_CODE,
} from '../errors/invalid-branch-menu-item.error.js';

export interface BranchMenuItemProps {
  id: UniqueId;
  organizationId: string;
  branchId: string;
  menuItemId: string;
  priceOverride: MenuPrice | null;
  displayOrder: number;
  status: BranchMenuItemStatus;
  availability: BranchMenuItemAvailability;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBranchMenuItemInput {
  id?: string;
  organizationId: string;
  branchId: string;
  menuItemId: string;
  priceOverrideInToman?: number | null;
  displayOrder?: number;
}

export interface ReconstituteBranchMenuItemInput {
  id: string;
  organizationId: string;
  branchId: string;
  menuItemId: string;
  priceOverrideInToman: number | null;
  displayOrder: number;
  status: BranchMenuItemStatus;
  availability: BranchMenuItemAvailability;
  createdAt: Date;
  updatedAt: Date;
}

export class BranchMenuItem extends Entity<UniqueId> {
  private readonly _id: UniqueId;
  private readonly _organizationId: string;
  private readonly _branchId: string;
  private readonly _menuItemId: string;
  private _priceOverride: MenuPrice | null;
  private _displayOrder: number;
  private _status: BranchMenuItemStatus;
  private _availability: BranchMenuItemAvailability;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: BranchMenuItemProps) {
    super(props.id);
    this._id = props.id;
    this._organizationId = props.organizationId;
    this._branchId = props.branchId;
    this._menuItemId = props.menuItemId;
    this._priceOverride = props.priceOverride;
    this._displayOrder = props.displayOrder;
    this._status = props.status;
    this._availability = props.availability;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // Create

  static create(input: CreateBranchMenuItemInput): BranchMenuItem {
    if (input.id !== undefined && !input.id.trim()) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.ID_REQUIRED,
        'Branch menu item ID cannot be empty.',
      );
    }

    const now = new Date();

    const props: BranchMenuItemProps = {
      id: new UniqueId(input.id),
      organizationId: input.organizationId.trim(),
      branchId: input.branchId.trim(),
      menuItemId: input.menuItemId.trim(),
      priceOverride:
        input.priceOverrideInToman === null ||
        input.priceOverrideInToman === undefined
          ? null
          : MenuPrice.create(input.priceOverrideInToman),
      displayOrder: input.displayOrder ?? 0,
      status: BRANCH_MENU_ITEM_STATUS.ACTIVE,
      availability: BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE,
      createdAt: now,
      updatedAt: now,
    };

    this.validate(props);

    return new BranchMenuItem(props);
  }

  // Reconstitute

  static reconstitute(input: ReconstituteBranchMenuItemInput): BranchMenuItem {
    if (!input.id?.trim()) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.ID_REQUIRED,
        'Branch menu item ID is required.',
      );
    }

    const props: BranchMenuItemProps = {
      id: new UniqueId(input.id),
      organizationId: input.organizationId.trim(),
      branchId: input.branchId.trim(),
      menuItemId: input.menuItemId.trim(),
      priceOverride:
        input.priceOverrideInToman === null
          ? null
          : MenuPrice.create(input.priceOverrideInToman),
      displayOrder: input.displayOrder,
      status: input.status,
      availability: input.availability,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };

    this.validate(props);

    return new BranchMenuItem(props);
  }

  // Validation

  private static validate(props: BranchMenuItemProps): void {
    if (!props.organizationId.trim()) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.ORGANIZATION_ID_REQUIRED,
        'Organization ID is required.',
      );
    }

    if (!props.branchId.trim()) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.BRANCH_ID_REQUIRED,
        'Branch ID is required.',
      );
    }

    if (!props.menuItemId.trim()) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.MENU_ITEM_ID_REQUIRED,
        'Menu item ID is required.',
      );
    }

    if (!Number.isInteger(props.displayOrder) || props.displayOrder < 0) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.DISPLAY_ORDER_INVALID,
        'Display order must be a non-negative integer.',
      );
    }

    if (!Object.values(BRANCH_MENU_ITEM_STATUS).includes(props.status)) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.STATUS_INVALID,
        'Branch menu item status is invalid.',
      );
    }

    if (
      !Object.values(BRANCH_MENU_ITEM_AVAILABILITY).includes(props.availability)
    ) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.AVAILABILITY_INVALID,
        'Branch menu item availability is invalid.',
      );
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime()) ||
      !(props.updatedAt instanceof Date) ||
      Number.isNaN(props.updatedAt.getTime())
    ) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.TIMESTAMPS_INVALID,
        'Branch menu item timestamps are invalid.',
      );
    }
  }

  private assertValidDisplayOrder(displayOrder: number): void {
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new InvalidBranchMenuItemDataError(
        BRANCH_MENU_ITEM_CODE.DISPLAY_ORDER_INVALID,
        'Display order must be a non-negative integer.',
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

  get branchId(): string {
    return this._branchId;
  }

  get menuItemId(): string {
    return this._menuItemId;
  }

  get priceOverride(): MenuPrice | null {
    return this._priceOverride;
  }

  get displayOrder(): number {
    return this._displayOrder;
  }

  get status(): BranchMenuItemStatus {
    return this._status;
  }

  get availability(): BranchMenuItemAvailability {
    return this._availability;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  // Status Checks

  isActive(): boolean {
    return this._status === BRANCH_MENU_ITEM_STATUS.ACTIVE;
  }

  isInactive(): boolean {
    return this._status === BRANCH_MENU_ITEM_STATUS.INACTIVE;
  }

  isAvailable(): boolean {
    return this._availability === BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE;
  }

  isUnavailable(): boolean {
    return this._availability === BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE;
  }

  // Behaviors

  changePriceOverride(amountInToman: number): void {
    const newPrice = MenuPrice.create(amountInToman);

    if (this._priceOverride?.equals(newPrice)) {
      return;
    }

    this._priceOverride = newPrice;

    this.touch();
  }

  clearPriceOverride(): void {
    if (this._priceOverride === null) {
      return;
    }

    this._priceOverride = null;

    this.touch();
  }

  getEffectivePrice(basePrice: MenuPrice): MenuPrice {
    return this._priceOverride ?? basePrice;
  }

  updateDisplayOrder(displayOrder: number): void {
    this.assertValidDisplayOrder(displayOrder);

    if (this._displayOrder === displayOrder) {
      return;
    }

    this._displayOrder = displayOrder;

    this.touch();
  }

  activate(): void {
    if (this.isActive()) {
      return;
    }

    this._status = BRANCH_MENU_ITEM_STATUS.ACTIVE;

    this.touch();
  }

  deactivate(): void {
    if (this.isInactive()) {
      return;
    }

    this._status = BRANCH_MENU_ITEM_STATUS.INACTIVE;

    this.touch();
  }

  markAsAvailable(): void {
    if (this.isAvailable()) {
      return;
    }

    this._availability = BRANCH_MENU_ITEM_AVAILABILITY.AVAILABLE;

    this.touch();
  }

  markAsUnavailable(): void {
    if (this.isUnavailable()) {
      return;
    }

    this._availability = BRANCH_MENU_ITEM_AVAILABILITY.UNAVAILABLE;

    this.touch();
  }
}
