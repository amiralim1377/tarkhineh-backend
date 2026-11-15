import { describe, expect, it } from 'vitest';
import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';
import { BranchAddress, type BranchAddressInput } from './branch-address.vo.js';
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
    describe('valid input', () => {
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
        expect(result.cityFa).toBe('تهران');
        expect(result.cityEn).toBeNull();
        expect(result.postalCode).toBeNull();
        expect(result.countryCode).toBe('IR');
      });

      it('should accept null optional fields', () => {
        const result = BranchAddress.create({
          ...validAddressInput,
          addressEn: null,
          cityEn: null,
          postalCode: null,
        });

        expect(result.addressEn).toBeNull();
        expect(result.cityEn).toBeNull();
        expect(result.postalCode).toBeNull();
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
    });

    describe('normalization', () => {
      it('should trim whitespace from address and city values', () => {
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
    });

    describe('required fields validation', () => {
      it('should reject an empty Persian address', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              addressFa: '',
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a whitespace-only Persian address', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              addressFa: '   ',
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject an empty Persian city', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              cityFa: '',
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a whitespace-only Persian city', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              cityFa: '   ',
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });
    });

    describe('maximum length validation', () => {
      it('should reject an address longer than 500 characters', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              addressFa: 'A'.repeat(501),
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject an English address longer than 500 characters', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              addressEn: 'A'.repeat(501),
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a Persian city longer than 120 characters', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              cityFa: 'ش'.repeat(121),
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject an English city longer than 120 characters', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              cityEn: 'A'.repeat(121),
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a postal code longer than 32 characters', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              postalCode: '1'.repeat(33),
            }),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });
    });

    describe('runtime input type validation', () => {
      it('should reject null input', () => {
        expectBranchDataError(
          () => BranchAddress.create(null as unknown as BranchAddressInput),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject undefined input', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create(undefined as unknown as BranchAddressInput),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a non-string Persian address', () => {
        const input = {
          ...validAddressInput,
          addressFa: 123,
        } as unknown as BranchAddressInput;

        expectBranchDataError(
          () => BranchAddress.create(input),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a non-string Persian city', () => {
        const input = {
          ...validAddressInput,
          cityFa: 123,
        } as unknown as BranchAddressInput;

        expectBranchDataError(
          () => BranchAddress.create(input),
          BRANCH_ERROR_CODE.ADDRESS_INVALID,
        );
      });

      it('should reject a non-string country code', () => {
        const input = {
          ...validAddressInput,
          countryCode: 123,
        } as unknown as BranchAddressInput;

        expectBranchDataError(
          () => BranchAddress.create(input),
          BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
        );
      });

      it.each([
        ['addressEn', 123],
        ['cityEn', 123],
        ['postalCode', 123],
      ] as const)(
        'should reject a non-string optional field: %s',
        (field, value) => {
          const input = {
            ...validAddressInput,
            [field]: value,
          } as unknown as BranchAddressInput;

          expectBranchDataError(
            () => BranchAddress.create(input),
            BRANCH_ERROR_CODE.ADDRESS_INVALID,
          );
        },
      );
    });

    describe('country code validation', () => {
      it('should accept a valid ISO 3166-1 alpha-2 country code', () => {
        const result = BranchAddress.create({
          ...validAddressInput,
          countryCode: 'IR',
        });

        expect(result.countryCode).toBe('IR');
      });

      it('should reject a two-letter code that is not assigned by ISO', () => {
        expectBranchDataError(
          () =>
            BranchAddress.create({
              ...validAddressInput,
              countryCode: 'ZZ',
            }),
          BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
        );
      });

      it.each(['', 'I', 'IRN', '12', '1R', 'I-R'])(
        'should reject an invalid country code: "%s"',
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
  });

  describe('equals', () => {
    it('should return true for addresses with identical values', () => {
      const first = BranchAddress.create(validAddressInput);
      const second = BranchAddress.create({ ...validAddressInput });

      expect(first.equals(second)).toBe(true);
    });

    it('should return true for addresses with equivalent normalized values', () => {
      const first = BranchAddress.create(validAddressInput);

      const second = BranchAddress.create({
        ...validAddressInput,
        addressFa: '  خیابان ولیعصر، پلاک ۱۰  ',
        addressEn: ' Valiasr Street, No. 10 ',
        cityFa: ' تهران ',
        cityEn: ' Tehran ',
        postalCode: ' 1234567890 ',
        countryCode: ' ir ',
      });

      expect(first.equals(second)).toBe(true);
    });

    it('should return true when optional fields are omitted or explicitly null', () => {
      const first = BranchAddress.create({
        addressFa: 'خیابان ولیعصر',
        cityFa: 'تهران',
        countryCode: 'IR',
      });

      const second = BranchAddress.create({
        addressFa: 'خیابان ولیعصر',
        addressEn: null,
        cityFa: 'تهران',
        cityEn: null,
        postalCode: null,
        countryCode: 'IR',
      });

      expect(first.equals(second)).toBe(true);
    });

    it.each([
      ['addressFa', 'خیابان آزادی'],
      ['addressEn', 'Azadi Street'],
      ['cityFa', 'اصفهان'],
      ['cityEn', 'Isfahan'],
      ['postalCode', '9876543210'],
      ['countryCode', 'US'],
    ] as const)('should return false when %s is different', (field, value) => {
      const first = BranchAddress.create(validAddressInput);

      const second = BranchAddress.create({
        ...validAddressInput,
        [field]: value,
      });

      expect(first.equals(second)).toBe(false);
    });
  });
});
