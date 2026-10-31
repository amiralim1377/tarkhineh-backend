import {
  ACCESS_CONTROL_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';

export class OrganizationSlug {
  private static readonly SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  private constructor(private readonly value: string) {}

  static create(value: string): OrganizationSlug {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');

    if (!OrganizationSlug.SLUG_PATTERN.test(normalized)) {
      throw new InvalidOrganizationDataError(
        ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
        'Organization slug is invalid.',
      );
    }

    return new OrganizationSlug(normalized);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: OrganizationSlug): boolean {
    return this.value === other.value;
  }
}
