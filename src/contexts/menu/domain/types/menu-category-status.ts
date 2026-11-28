export const MENU_CATEGORY_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type MenuCategoryStatus =
  (typeof MENU_CATEGORY_STATUS)[keyof typeof MENU_CATEGORY_STATUS];
