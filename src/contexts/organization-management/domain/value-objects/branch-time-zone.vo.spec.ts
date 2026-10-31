import { describe, expect, it } from 'vitest';

import { BranchTimeZone } from './branch-time-zone.vo.js';

import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';

import { expectBranchDataError } from './branch-value-object.spec-helper.js';

describe('BranchTimeZone', () => {
  describe('create', () => {
    it('should create a valid Tehran time zone', () => {
      const result = BranchTimeZone.create('Asia/Tehran');

      expect(result.value).toBe('Asia/Tehran');
    });

    it('should create a valid Istanbul time zone', () => {
      const result = BranchTimeZone.create('Europe/Istanbul');

      expect(result.value).toBe('Europe/Istanbul');
    });

    it('should accept UTC time zone', () => {
      const result = BranchTimeZone.create('UTC');

      expect(result.value).toBe('UTC');
    });

    it('should accept Etc/UTC time zone', () => {
      const result = BranchTimeZone.create('Etc/UTC');

      expect(result.value).toBe('Etc/UTC');
    });

    it('should trim leading and trailing whitespace', () => {
      const result = BranchTimeZone.create('  Asia/Tehran  ');

      expect(result.value).toBe('Asia/Tehran');
    });

    it.each(['', '   '])('should reject empty time zone: "%s"', (value) => {
      expectBranchDataError(
        () => BranchTimeZone.create(value),
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
      );
    });

    it.each([
      'Invalid/TimeZone',
      'Asia/InvalidCity',
      'NotATimeZone',
      'GMT+999',
      'Unknown',
    ])('should reject invalid time zone: "%s"', (value) => {
      expectBranchDataError(
        () => BranchTimeZone.create(value),
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
      );
    });
  });

  describe('equals', () => {
    it('should return true for equal time zones', () => {
      const first = BranchTimeZone.create('Asia/Tehran');
      const second = BranchTimeZone.create('Asia/Tehran');

      expect(first.equals(second)).toBe(true);
    });

    it('should return false for different time zones', () => {
      const first = BranchTimeZone.create('Asia/Tehran');
      const second = BranchTimeZone.create('Europe/Istanbul');

      expect(first.equals(second)).toBe(false);
    });
  });
});
