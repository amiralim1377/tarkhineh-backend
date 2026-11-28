import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const MENU_CATEGORY_CODE = {
  ID_REQUIRED: 'MENU_CATEGORY.ID_REQUIRED',
  ORGANIZATION_ID_REQUIRED: 'MENU_CATEGORY.ORGANIZATION_ID_REQUIRED',
  NAME_FA_REQUIRED: 'MENU_CATEGORY.NAME_FA_REQUIRED',
  DISPLAY_ORDER_INVALID: 'MENU_CATEGORY.DISPLAY_ORDER_INVALID',
  STATUS_INVALID: 'MENU_CATEGORY.STATUS_INVALID',
  TIMESTAMPS_INVALID: 'MENU_CATEGORY.TIMESTAMPS_INVALID',
  ARCHIVED_CANNOT_BE_MODIFIED: 'MENU_CATEGORY.ARCHIVED_CANNOT_BE_MODIFIED',
  ARCHIVED_CANNOT_BE_ACTIVATED: 'MENU_CATEGORY.ARCHIVED_CANNOT_BE_ACTIVATED',
} as const;

export type MenuCategoryDataErrorCode =
  (typeof MENU_CATEGORY_CODE)[keyof typeof MENU_CATEGORY_CODE];

export class InvalidMenuCategoryDataError extends DomainError {
  override readonly code: MenuCategoryDataErrorCode;

  constructor(code: MenuCategoryDataErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
