export const MENU_ITEM_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type MenuItemStatus =
  (typeof MENU_ITEM_STATUS)[keyof typeof MENU_ITEM_STATUS];
