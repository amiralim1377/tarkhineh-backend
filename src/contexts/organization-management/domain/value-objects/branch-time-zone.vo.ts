import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

export class BranchTimeZone {
  private constructor(public readonly value: string) {}

  static create(value: string): BranchTimeZone {
    const normalized = value.trim();

    if (!normalized) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
        'Branch time zone is required.',
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: normalized,
      });
    } catch {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
        'Branch time zone must be a valid IANA time zone.',
      );
    }

    return new BranchTimeZone(normalized);
  }

  equals(other: BranchTimeZone): boolean {
    return this.value === other.value;
  }
}
