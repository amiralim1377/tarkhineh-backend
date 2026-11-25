import { MenuItem } from '../../domain/entities/menu-item.js';

export const MENU_ITEM_PORT = Symbol('MENU_ITEM_PORT');

export interface MenuItemPort {
  findById(
    organizationId: string,
    menuItemId: string,
  ): Promise<MenuItem | null>;

  save(menuItem: MenuItem): Promise<void>;

  update(menuItem: MenuItem): Promise<void>;
}
