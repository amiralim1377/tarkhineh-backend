import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

export class BranchSlug {
  private static readonly SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  private constructor(private readonly value: string) {}

  static create(value: string): BranchSlug {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');

    // Validate the normalized slug.
    if (!BranchSlug.SLUG_PATTERN.test(normalized)) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.SLUG_INVALID,
        'Branch slug is invalid.',
      );
    }

    return new BranchSlug(normalized);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: BranchSlug): boolean {
    return this.value === other.value;
  }
}
