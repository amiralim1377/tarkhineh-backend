import { describe, expect, it } from 'vitest';

import { BranchPhoneNumber } from './branch-phone-number.vo.js';

import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';

import { expectBranchDataError } from './branch-value-object.spec-helper.js';

describe('BranchPhoneNumber', () => {
  describe('create', () => {
    it('should create a valid Iranian phone number', () => {
      const result = BranchPhoneNumber.create('+989121234567');

      expect(result).not.toBeNull();
      expect(result?.value).toBe('+989121234567');
    });

    it('should create a valid international phone number', () => {
      const result = BranchPhoneNumber.create('+12025550123');

      expect(result?.value).toBe('+12025550123');
    });

    it('should accept a number containing the maximum 15 digits', () => {
      const result = BranchPhoneNumber.create('+123456789012345');

      expect(result?.value).toBe('+123456789012345');
    });

    it('should trim leading and trailing whitespace', () => {
      const result = BranchPhoneNumber.create('  +989121234567  ');

      expect(result?.value).toBe('+989121234567');
    });

    it('should return null when value is undefined', () => {
      const result = BranchPhoneNumber.create(undefined);

      expect(result).toBeNull();
    });

    it('should return null when value is null', () => {
      const result = BranchPhoneNumber.create(null);

      expect(result).toBeNull();
    });

    it('should return null when value is empty', () => {
      const result = BranchPhoneNumber.create('');

      expect(result).toBeNull();
    });

    it('should return null when value contains only whitespace', () => {
      const result = BranchPhoneNumber.create('   ');

      expect(result).toBeNull();
    });

    it.each([
      '09121234567',
      '989121234567',
      '+',
      '+0',
      '+0123456789',
      '+1234567890123456',
      '++989121234567',
      '+98 9121234567',
      '+98-9121234567',
      '+98(912)1234567',
      '+98abc9121234567',
      '++123456789',
    ])('should reject invalid phone number: "%s"', (value) => {
      expectBranchDataError(
        () => BranchPhoneNumber.create(value),
        BRANCH_ERROR_CODE.PHONE_NUMBER_INVALID,
      );
    });
  });

  describe('equals', () => {
    it('should return true for equal phone numbers', () => {
      const first = BranchPhoneNumber.create('+989121234567');
      const second = BranchPhoneNumber.create('+989121234567');

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.equals(second!)).toBe(true);
    });

    it('should return false for different phone numbers', () => {
      const first = BranchPhoneNumber.create('+989121234567');
      const second = BranchPhoneNumber.create('+989121234568');

      expect(first!.equals(second!)).toBe(false);
    });
  });
});
