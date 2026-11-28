import { describe, expect, it } from 'vitest';
import { MenuPrice } from './menu-price.vo.js';
import {
  InvalidMenuPriceError,
  MENU_PRICE_CODE,
} from '../errors/invalid-menu-price.error.js';

function expectInvalidPriceError(amount: number): void {
  let thrownError: unknown;

  try {
    MenuPrice.create(amount);
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(InvalidMenuPriceError);

  expect((thrownError as InvalidMenuPriceError).code).toBe(
    MENU_PRICE_CODE.AMOUNT_INVALID,
  );
}

describe('MenuPrice', () => {
  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('should create a menu price successfully', () => {
      // Arrange
      const amountInToman = 250000;

      // Act
      const price = MenuPrice.create(amountInToman);

      // Assert
      expect(price).toBeInstanceOf(MenuPrice);
      expect(price.value).toBe(250000);
    });

    it('should create a price with a positive integer amount', () => {
      // Arrange
      const amountInToman = 500000;

      // Act
      const price = MenuPrice.create(amountInToman);

      // Assert
      expect(price.value).toBe(500000);
    });

    it('should reject a negative price', () => {
      // Arrange
      const amountInToman = -100000;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });

    it('should reject a zero price', () => {
      // Arrange
      const amountInToman = 0;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });

    it('should reject a decimal price', () => {
      // Arrange
      const amountInToman = 250000.5;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });

    it('should reject NaN as a price', () => {
      // Arrange
      const amountInToman = NaN;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });

    it('should reject Infinity as a price', () => {
      // Arrange
      const amountInToman = Infinity;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });

    it('should reject negative Infinity as a price', () => {
      // Arrange
      const amountInToman = -Infinity;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });

    it('should reject an unsafe integer price', () => {
      // Arrange
      const amountInToman = Number.MAX_SAFE_INTEGER + 1;

      // Act & Assert
      expectInvalidPriceError(amountInToman);
    });
  });

  // ---------------------------------------------------------------------------
  // Value
  // ---------------------------------------------------------------------------

  describe('value', () => {
    it('should return the price amount in Toman', () => {
      // Arrange
      const price = MenuPrice.create(350000);

      // Act
      const amount = price.value;

      // Assert
      expect(amount).toBe(350000);
    });
  });

  // ---------------------------------------------------------------------------
  // Equals
  // ---------------------------------------------------------------------------

  describe('equals', () => {
    it('should return true when two prices have the same amount', () => {
      // Arrange
      const firstPrice = MenuPrice.create(250000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.equals(secondPrice);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when two prices have different amounts', () => {
      // Arrange
      const firstPrice = MenuPrice.create(250000);
      const secondPrice = MenuPrice.create(300000);

      // Act
      const result = firstPrice.equals(secondPrice);

      // Assert
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Is Greater Than
  // ---------------------------------------------------------------------------

  describe('isGreaterThan', () => {
    it('should return true when the first price is greater than the second price', () => {
      // Arrange
      const firstPrice = MenuPrice.create(300000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.isGreaterThan(secondPrice);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when the first price is less than the second price', () => {
      // Arrange
      const firstPrice = MenuPrice.create(200000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.isGreaterThan(secondPrice);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when both prices are equal', () => {
      // Arrange
      const firstPrice = MenuPrice.create(250000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.isGreaterThan(secondPrice);

      // Assert
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Is Less Than
  // ---------------------------------------------------------------------------

  describe('isLessThan', () => {
    it('should return true when the first price is less than the second price', () => {
      // Arrange
      const firstPrice = MenuPrice.create(200000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.isLessThan(secondPrice);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when the first price is greater than the second price', () => {
      // Arrange
      const firstPrice = MenuPrice.create(300000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.isLessThan(secondPrice);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when both prices are equal', () => {
      // Arrange
      const firstPrice = MenuPrice.create(250000);
      const secondPrice = MenuPrice.create(250000);

      // Act
      const result = firstPrice.isLessThan(secondPrice);

      // Assert
      expect(result).toBe(false);
    });
  });
});
