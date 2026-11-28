import type { TransactionContext } from '../../../../shared/application/ports/transaction-runner.port.js';
import { MenuItem } from '../../domain/entities/menu-item.js';

export const MENU_ITEM_PORT = Symbol('MENU_ITEM_PORT');

export interface MenuItemPort {
  findById(
    organizationId: string,
    menuItemId: string,
    context?: TransactionContext,
  ): Promise<MenuItem | null>;

  save(menuItem: MenuItem, context?: TransactionContext): Promise<void>;

  update(menuItem: MenuItem, context?: TransactionContext): Promise<void>;
}
