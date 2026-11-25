import { MenuItem } from '../../../domain/entities/menu-item.js';
import type { MenuItemStatus } from '../../../domain/types/menu-item-status.js';

export interface PrismaMenuItemRecord {
  id: string;
  organizationId: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  descriptionEn: string | null;
  imageId: string | null;
  basePrice: bigint;
  status: MenuItemStatus;
  createdAt: Date;
  updatedAt: Date;

  menuItemCategories: {
    categoryId: string;
  }[];
}

export class PrismaMenuItemMapper {
  static toDomain(record: PrismaMenuItemRecord): MenuItem {
    const basePriceInToman = Number(record.basePrice);

    if (!Number.isSafeInteger(basePriceInToman)) {
      throw new RangeError(
        'Persisted menu item price exceeds the safe integer range.',
      );
    }

    return MenuItem.reconstitute({
      id: record.id,
      organizationId: record.organizationId,
      nameFa: record.nameFa,
      nameEn: record.nameEn,
      descriptionFa: record.descriptionFa,
      descriptionEn: record.descriptionEn,
      imageId: record.imageId,
      basePriceInToman,
      categoryIds: record.menuItemCategories.map(
        (category) => category.categoryId,
      ),
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  static toPersistence(menuItem: MenuItem) {
    return {
      id: menuItem.id,
      organizationId: menuItem.organizationId,
      nameFa: menuItem.nameFa,
      nameEn: menuItem.nameEn,
      descriptionFa: menuItem.descriptionFa,
      descriptionEn: menuItem.descriptionEn,
      imageId: menuItem.imageId,
      basePrice: BigInt(menuItem.basePrice.value),
      status: menuItem.status,
      createdAt: menuItem.createdAt,
      updatedAt: menuItem.updatedAt,
    };
  }
}
