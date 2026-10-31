import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

export class BranchName {
  private constructor(
    public readonly nameFa: string,
    public readonly nameEn: string | null,
  ) {}

  static create(nameFa: string, nameEn?: string | null): BranchName {
    if (typeof nameFa !== 'string' || nameFa.trim().length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.NAME_REQUIRED,
        'Persian branch name is required.',
      );
    }

    const normalizedFa = nameFa.trim();
    const normalizedEn = nameEn?.trim() || null;

    if (
      normalizedFa.length > 120 ||
      (normalizedEn !== null && normalizedEn.length > 120)
    ) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.NAME_INVALID,
        'Branch name cannot exceed 120 characters.',
      );
    }

    return new BranchName(normalizedFa, normalizedEn);
  }

  equals(other: BranchName): boolean {
    return this.nameFa === other.nameFa && this.nameEn === other.nameEn;
  }
}
