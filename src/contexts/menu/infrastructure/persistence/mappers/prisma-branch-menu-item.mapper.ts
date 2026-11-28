import { BranchMenuItem } from '../../../domain/entities/branch-menu-item.js';
import type { BranchMenuItemStatus } from '../../../domain/types/branch-menu-item-status.js';
import type { BranchMenuItemAvailability } from '../../../domain/types/branch-menu-item-availability.js';

export interface PrismaBranchMenuItemRecord {
  id: string;
  organizationId: string;
  branchId: string;
  menuItemId: string;
  priceOverride: bigint | null;
  displayOrder: number;
  status: BranchMenuItemStatus;
  availability: BranchMenuItemAvailability;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaBranchMenuItemMapper {
  static toDomain(record: PrismaBranchMenuItemRecord): BranchMenuItem {
    const priceOverrideInToman =
      record.priceOverride === null ? null : Number(record.priceOverride);

    if (
      priceOverrideInToman !== null &&
      !Number.isSafeInteger(priceOverrideInToman)
    ) {
      throw new RangeError(
        `Branch menu item price override exceeds the safe integer range. ID: ${record.id}`,
      );
    }

    return BranchMenuItem.reconstitute({
      id: record.id,
      organizationId: record.organizationId,
      branchId: record.branchId,
      menuItemId: record.menuItemId,
      priceOverrideInToman,
      displayOrder: record.displayOrder,
      status: record.status,
      availability: record.availability,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  static toPersistence(branchMenuItem: BranchMenuItem) {
    return {
      id: branchMenuItem.id,
      organizationId: branchMenuItem.organizationId,
      branchId: branchMenuItem.branchId,
      menuItemId: branchMenuItem.menuItemId,
      priceOverride:
        branchMenuItem.priceOverride === null
          ? null
          : BigInt(branchMenuItem.priceOverride.value),
      displayOrder: branchMenuItem.displayOrder,
      status: branchMenuItem.status,
      availability: branchMenuItem.availability,
      createdAt: branchMenuItem.createdAt,
      updatedAt: branchMenuItem.updatedAt,
    };
  }
}
