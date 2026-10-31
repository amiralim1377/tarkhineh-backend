import { describe, expect, it } from 'vitest';

import { BranchAddress, type BranchAddressInput } from './branch-address.vo.js';

import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';

import { expectBranchDataError } from './branch-value-object.spec-helper.js';

const validAddressInput: BranchAddressInput = {
  addressFa: 'خیابان ولیعصر، پلاک ۱۰',
  addressEn: 'Valiasr Street, No. 10',
  cityFa: 'تهران',
  cityEn: 'Tehran',
  postalCode: '1234567890',
  countryCode: 'IR',
};

describe('BranchAddress', () => {
  describe('create', () => {
    it('should create a complete branch address', () => {
      const result = BranchAddress.create(validAddressInput);

      expect(result.addressFa).toBe('خیابان ولیعصر، پلاک ۱۰');
      expect(result.addressEn).toBe('Valiasr Street, No. 10');
      expect(result.cityFa).toBe('تهران');
      expect(result.cityEn).toBe('Tehran');
      expect(result.postalCode).toBe('1234567890');
      expect(result.countryCode).toBe('IR');
    });

    it('should create an address without optional fields', () => {
      const result = BranchAddress.create({
        addressFa: 'خیابان ولیعصر',
        cityFa: 'تهران',
        countryCode: 'IR',
      });

      expect(result.addressFa).toBe('خیابان ولیعصر');
      expect(result.addressEn).toBeNull();
      expect(result.cityEn).toBeNull();
      expect(result.postalCode).toBeNull();
    });

    it('should trim address and city values', () => {
      const result = BranchAddress.create({
        ...validAddressInput,
        addressFa: '  خیابان ولیعصر  ',
        addressEn: '  Valiasr Street  ',
        cityFa: '  تهران  ',
        cityEn: '  Tehran  ',
        postalCode: ' 1234567890 ',
      });

      expect(result.addressFa).toBe('خیابان ولیعصر');
      expect(result.addressEn).toBe('Valiasr Street');
      expect(result.cityFa).toBe('تهران');
      expect(result.cityEn).toBe('Tehran');
      expect(result.postalCode).toBe('1234567890');
    });

    it('should normalize country code to uppercase', () => {
      const result = BranchAddress.create({
        ...validAddressInput,
        countryCode: ' ir ',
      });

      expect(result.countryCode).toBe('IR');
    });

    it('should convert empty optional fields to null', () => {
      const result = BranchAddress.create({
        ...validAddressInput,
        addressEn: '',
        cityEn: '   ',
        postalCode: '',
      });

      expect(result.addressEn).toBeNull();
      expect(result.cityEn).toBeNull();
      expect(result.postalCode).toBeNull();
    });

    it('should reject empty Persian address', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            addressFa: '   ',
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject empty Persian city', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            cityFa: '',
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject address longer than 500 characters', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            addressFa: 'A'.repeat(501),
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject English address longer than 500 characters', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            addressEn: 'A'.repeat(501),
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject Persian city longer than 120 characters', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            cityFa: 'ش'.repeat(121),
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject English city longer than 120 characters', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            cityEn: 'A'.repeat(121),
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject postal code longer than 32 characters', () => {
      expectBranchDataError(
        () =>
          BranchAddress.create({
            ...validAddressInput,
            postalCode: '1'.repeat(33),
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should accept values at their maximum allowed lengths', () => {
      const result = BranchAddress.create({
        addressFa: 'ش'.repeat(500),
        addressEn: 'A'.repeat(500),
        cityFa: 'ش'.repeat(120),
        cityEn: 'A'.repeat(120),
        postalCode: '1'.repeat(32),
        countryCode: 'IR',
      });

      expect(result.addressFa).toHaveLength(500);
      expect(result.addressEn).toHaveLength(500);
      expect(result.cityFa).toHaveLength(120);
      expect(result.cityEn).toHaveLength(120);
      expect(result.postalCode).toHaveLength(32);
    });

    it.each(['', 'I', 'IRN', '12', '1R', 'I-R'])(
      'should reject invalid country code: "%s"',
      (countryCode) => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              countryCode,
            }),
          BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
        );
      },
    );
  });

  describe('equals', () => {
    it('should return true for equal addresses', () => {
      const first = BranchAddress.create(validAddressInput);
      const second = BranchAddress.create({ ...validAddressInput });

      expect(first.equals(second)).toBe(true);
    });

    it('should return false when addresses are different', () => {
      const first = BranchAddress.create(validAddressInput);

      const second = BranchAddress.create({
        ...validAddressInput,
        addressFa: 'خیابان آزادی',
      });

      expect(first.equals(second)).toBe(false);
    });

    it('should return false when city is different', () => {
      const first = BranchAddress.create(validAddressInput);

      const second = BranchAddress.create({
        ...validAddressInput,
        cityFa: 'اصفهان',
      });

      expect(first.equals(second)).toBe(false);
    });

    it('should return false when country code is different', () => {
      const first = BranchAddress.create(validAddressInput);

      const second = BranchAddress.create({
        ...validAddressInput,
        countryCode: 'US',
      });

      expect(first.equals(second)).toBe(false);
    });
  });
});
