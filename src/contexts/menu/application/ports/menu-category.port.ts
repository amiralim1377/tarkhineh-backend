import { MenuCategory } from '../../domain/entities/menu-category.js';

export const MENU_CATEGORY_PORT = Symbol('MENU_CATEGORY_PORT');

export interface MenuCategoryPort {
  findById(
    organizationId: string,
    categoryId: string,
  ): Promise<MenuCategory | null>;

  findByIds(
    organizationId: string,
    categoryIds: readonly string[],
  ): Promise<MenuCategory[]>;

  save(category: MenuCategory): Promise<void>;

  update(category: MenuCategory): Promise<void>;
}
