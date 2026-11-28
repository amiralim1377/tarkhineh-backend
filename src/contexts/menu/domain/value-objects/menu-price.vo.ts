import {
  InvalidMenuPriceError,
  MENU_PRICE_CODE,
} from '../errors/invalid-menu-price.error.js';

export class MenuPrice {
  private constructor(private readonly amountInToman: number) {}

  static create(amountInToman: number): MenuPrice {
    if (!Number.isSafeInteger(amountInToman) || amountInToman <= 0) {
      throw new InvalidMenuPriceError(
        MENU_PRICE_CODE.AMOUNT_INVALID,
        'Menu price must be a positive integer in Toman.',
      );
    }

    return new MenuPrice(amountInToman);
  }

  get value(): number {
    return this.amountInToman;
  }

  equals(other: MenuPrice): boolean {
    return this.amountInToman === other.amountInToman;
  }

  isGreaterThan(other: MenuPrice): boolean {
    return this.amountInToman > other.amountInToman;
  }

  isLessThan(other: MenuPrice): boolean {
    return this.amountInToman < other.amountInToman;
  }
}
