import { describe, expect, it } from 'vitest';

import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

import { BranchSlug } from './branch-slug.vo.js';

describe('BranchSlug', () => {
  function createSut(value: string) {
    return BranchSlug.create(value);
  }

  // ============================================
  // CREATE
  // ============================================

  describe('create', () => {
    it('creates a valid slug', () => {
      // ARRANGE
      const input = 'Tarkhineh Vanak';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result).toBeInstanceOf(BranchSlug);
      expect(result.getValue()).toBe('tarkhineh-vanak');
    });

    it('converts uppercase characters to lowercase', () => {
      // ARRANGE
      const input = 'TARKHINEH VANAK';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result.getValue()).toBe('tarkhineh-vanak');
    });

    it('normalizes whitespace between words', () => {
      // ARRANGE
      const input = '  TARKHINEH   VANAK  ';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result.getValue()).toBe('tarkhineh-vanak');
    });

    it('preserves a valid slug format', () => {
      // ARRANGE
      const input = 'tarkhineh-vanak-123';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result.getValue()).toBe('tarkhineh-vanak-123');
    });

    it.each([
      '',
      '   ',
      '-tarkhineh',
      '-tarkhineh-vanak',
      'tarkhineh-',
      'tarkhineh--vanak',
      'tarkhineh_vanak',
      'TARKHINEH@VANAK',
      'ترخینه',
    ])('rejects an invalid slug: %s', (invalidInput) => {
      // ARRANGE
      const input = invalidInput;

      // ACT & ASSERT
      expect(() => createSut(input)).toThrowError(InvalidBranchDataError);

      expect(() => createSut(input)).toThrowError(
        expect.objectContaining({
          code: BRANCH_ERROR_CODE.SLUG_INVALID,
        }),
      );
    });
  });

  // ============================================
  // EQUALS
  // ============================================

  describe('equals', () => {
    it('considers two slugs with the same normalized value equal', () => {
      // ARRANGE
      const first = createSut('TARKHINEH VANAK');
      const second = createSut('tarkhineh-vanak');

      // ACT
      const result = first.equals(second);

      // ASSERT
      expect(first).not.toBe(second);
      expect(result).toBe(true);
      expect(first.getValue()).toBe(second.getValue());
    });

    it('returns false when two slugs have different values', () => {
      // ARRANGE
      const first = createSut('tarkhineh-vanak');
      const second = createSut('tarkhineh-saadatabad');

      // ACT
      const result = first.equals(second);

      // ASSERT
      expect(result).toBe(false);
    });
  });
});
