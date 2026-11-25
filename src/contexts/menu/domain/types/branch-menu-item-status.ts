export const BRANCH_MENU_ITEM_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type BranchMenuItemStatus =
  (typeof BRANCH_MENU_ITEM_STATUS)[keyof typeof BRANCH_MENU_ITEM_STATUS];
