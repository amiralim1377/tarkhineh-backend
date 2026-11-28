import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const BRANCH_MENU_ITEM_CODE = {
  ID_REQUIRED: 'BRANCH_MENU_ITEM.ID_REQUIRED',
  ORGANIZATION_ID_REQUIRED: 'BRANCH_MENU_ITEM.ORGANIZATION_ID_REQUIRED',
  BRANCH_ID_REQUIRED: 'BRANCH_MENU_ITEM.BRANCH_ID_REQUIRED',
  MENU_ITEM_ID_REQUIRED: 'BRANCH_MENU_ITEM.MENU_ITEM_ID_REQUIRED',

  DISPLAY_ORDER_INVALID: 'BRANCH_MENU_ITEM.DISPLAY_ORDER_INVALID',

  STATUS_INVALID: 'BRANCH_MENU_ITEM.STATUS_INVALID',
  AVAILABILITY_INVALID: 'BRANCH_MENU_ITEM.AVAILABILITY_INVALID',

  TIMESTAMPS_INVALID: 'BRANCH_MENU_ITEM.TIMESTAMPS_INVALID',
} as const;

export type BranchMenuItemDataErrorCode =
  (typeof BRANCH_MENU_ITEM_CODE)[keyof typeof BRANCH_MENU_ITEM_CODE];

export class InvalidBranchMenuItemDataError extends DomainError {
  override readonly code: BranchMenuItemDataErrorCode;

  constructor(code: BranchMenuItemDataErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
