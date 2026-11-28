import { BranchMenuItem } from '../../domain/entities/branch-menu-item.js';

export const BRANCH_MENU_ITEM_PORT = Symbol('BRANCH_MENU_ITEM_PORT');

export interface BranchMenuItemPort {
  findById(
    organizationId: string,
    branchMenuItemId: string,
  ): Promise<BranchMenuItem | null>;

  findByBranchAndMenuItem(
    organizationId: string,
    branchId: string,
    menuItemId: string,
  ): Promise<BranchMenuItem | null>;

  save(branchMenuItem: BranchMenuItem): Promise<void>;

  update(branchMenuItem: BranchMenuItem): Promise<void>;
}
