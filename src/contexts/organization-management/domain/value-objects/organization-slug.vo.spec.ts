import { describe, expect, it } from 'vitest';

import {
  ORGANIZATION_MANAGEMENT_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';

import { OrganizationSlug } from './organization-slug.vo.js';

describe('OrganizationSlug', () => {
  function createSut(value: string) {
    return OrganizationSlug.create(value);
  }

  // ============================================
  // CREATE
  // ============================================

  describe('create', () => {
    it('creates a valid slug', () => {
      // ARRANGE
      const input = 'Tarkhineh Restaurant';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result).toBeInstanceOf(OrganizationSlug);
      expect(result.getValue()).toBe('tarkhineh-restaurant');
    });

    it('converts uppercase characters to lowercase', () => {
      // ARRANGE
      const input = 'TARKHINEH';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result.getValue()).toBe('tarkhineh');
    });

    it('normalizes whitespace between words', () => {
      // ARRANGE
      const input = '  DAS   IST EIN TEST  ';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result.getValue()).toBe('das-ist-ein-test');
    });

    it('preserves a valid slug format', () => {
      // ARRANGE
      const input = 'tarkhineh-restaurant-123';

      // ACT
      const result = createSut(input);

      // ASSERT
      expect(result.getValue()).toBe('tarkhineh-restaurant-123');
    });

    it.each([
      '',
      '   ',
      '-tarkhineh',
      '-TARKHINEH-',
      'tarkhineh-',
      'tarkhineh--restaurant',
      'tarkhineh_test',
      'DAS@IST@EIN@TEST',
      'ترخینه',
    ])('rejects invalid slug: %s', (invalidInput) => {
      // ARRANGE
      const input = invalidInput;

      // ACT & ASSERT
      expect(() => createSut(input)).toThrowError(InvalidOrganizationDataError);

      expect(() => createSut(input)).toThrowError(
        expect.objectContaining({
          code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
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
      const first = createSut('TARKHINEH');
      const second = createSut('tarkhineh');

      // ACT
      const result = first.equals(second);

      // ASSERT
      expect(first).not.toBe(second);
      expect(result).toBe(true);
      expect(first.getValue()).toBe(second.getValue());
    });

    it('returns false when two slugs have different values', () => {
      // ARRANGE
      const first = createSut('tarkhineh');
      const second = createSut('restaurant');

      // ACT
      const result = first.equals(second);

      // ASSERT
      expect(result).toBe(false);
    });
  });
});
