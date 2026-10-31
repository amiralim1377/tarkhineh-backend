import {
  ACCESS_CONTROL_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';
import { OrganizationSlug } from './organization-slug.vo.js';

describe('OrganizationSlug', () => {
  function createSut(value: string) {
    return OrganizationSlug.create(value);
  }

  it('creates a valid slug', () => {
    // Arrange: prepare input
    const testInput = 'Tarkhineh Restaurant';
    // Act: create the slug
    const result = createSut(testInput);
    // Assert: check the result
    expect(result.getValue()).toBe('tarkhineh-restaurant');
  });

  it('replaces consecutive spaces with a single hyphen', () => {
    // Arrange
    const input = 'DAS IST EIN TEST';

    // Act
    const result = createSut(input);

    // Assert
    expect(result.getValue()).toBe('das-ist-ein-test');
  });

  it('throws an error when slug contains consecutive hyphens', async () => {
    // Arrange
    const invalidInput = 'tarkhineh--restaurant';
    // Act & Assert
    expect(() => createSut(invalidInput)).toThrow(InvalidOrganizationDataError);

    expect(() => createSut(invalidInput)).toThrow(
      expect.objectContaining({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
      }),
    );
  });

  it('considers two slugs with the same normalized value equal', () => {
    // Arrange
    const first = createSut('TARKHINEH');
    const second = createSut('tarkhineh');
    // Act
    const areEqual = first.equals(second);
    // Assert
    expect(first).not.toBe(second);
    expect(areEqual).toBe(true);
    expect(first.getValue()).toBe(second.getValue());
  });

  it('returns false when two slugs have different values', () => {
    // Arrange
    const first = createSut('tarkhineh');
    const second = createSut('restaurant');

    // act
    const areEqual = first.equals(second);

    // assert
    expect(areEqual).toBe(false);
  });

  it.each([
    '',
    '   ',
    '-tarkhineh',
    '-TARKHINEH-',
    'tarkhineh-',
    'tarkhineh_test',
    'DAS@IST@EIN@TEST',
    'ترخینه',
  ])('rejects invalid slug: %s', (invalidInput) => {
    // Arrange, Act & Assert
    expect(() => createSut(invalidInput)).toThrow(InvalidOrganizationDataError);
  });
});
