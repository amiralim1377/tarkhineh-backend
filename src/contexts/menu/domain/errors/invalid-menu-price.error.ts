import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const MENU_PRICE_CODE = {
  AMOUNT_INVALID: 'MENU_PRICE.AMOUNT_INVALID',
} as const;

export type MenuPriceErrorCode =
  (typeof MENU_PRICE_CODE)[keyof typeof MENU_PRICE_CODE];

export class InvalidMenuPriceError extends DomainError {
  override readonly code: MenuPriceErrorCode;

  constructor(code: MenuPriceErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
