import type { MenuItemPort } from './menu-item.port.js';
import type { MenuCategoryPort } from './menu-category.port.js';

export const MENU_ITEM_UNIT_OF_WORK = Symbol('MENU_ITEM_UNIT_OF_WORK');

export interface MenuItemUnitOfWorkContext {
  readonly menuItemRepository: MenuItemPort;
  readonly menuCategoryRepository: MenuCategoryPort;
}

export interface MenuItemUnitOfWork {
  execute<T>(
    operation: (context: MenuItemUnitOfWorkContext) => Promise<T>,
  ): Promise<T>;
}
