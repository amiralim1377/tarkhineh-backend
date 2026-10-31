import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

export class BranchPhoneNumber {
  private constructor(public readonly value: string) {}

  static create(value?: string | null): BranchPhoneNumber | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      return null;
    }

    if (!/^\+[1-9]\d{1,14}$/.test(normalized)) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.PHONE_NUMBER_INVALID,
        'Phone number must use the international E.164 format.',
      );
    }

    return new BranchPhoneNumber(normalized);
  }

  equals(other: BranchPhoneNumber): boolean {
    return this.value === other.value;
  }
}
