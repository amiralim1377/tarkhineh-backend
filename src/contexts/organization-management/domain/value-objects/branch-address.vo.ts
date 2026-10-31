import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

export interface BranchAddressInput {
  addressFa: string;
  addressEn?: string | null;
  cityFa: string;
  cityEn?: string | null;
  postalCode?: string | null;
  countryCode: string;
}

export class BranchAddress {
  private constructor(
    public readonly addressFa: string,
    public readonly addressEn: string | null,
    public readonly cityFa: string,
    public readonly cityEn: string | null,
    public readonly postalCode: string | null,
    public readonly countryCode: string,
  ) {}

  static create(input: BranchAddressInput): BranchAddress {
    const addressFa = input.addressFa.trim();
    const cityFa = input.cityFa.trim();
    const countryCode = input.countryCode.trim().toUpperCase();

    const addressEn = input.addressEn?.trim() || null;
    const cityEn = input.cityEn?.trim() || null;
    const postalCode = input.postalCode?.trim() || null;

    if (!addressFa || !cityFa) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
        'Persian address and city are required.',
      );
    }

    if (
      addressFa.length > 500 ||
      (addressEn !== null && addressEn.length > 500) ||
      cityFa.length > 120 ||
      (cityEn !== null && cityEn.length > 120) ||
      (postalCode !== null && postalCode.length > 32)
    ) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
        'Branch address contains a value exceeding the allowed length.',
      );
    }

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
        'Country code must be a two-letter ISO country code.',
      );
    }

    return new BranchAddress(
      addressFa,
      addressEn,
      cityFa,
      cityEn,
      postalCode,
      countryCode,
    );
  }

  equals(other: BranchAddress): boolean {
    return (
      this.addressFa === other.addressFa &&
      this.addressEn === other.addressEn &&
      this.cityFa === other.cityFa &&
      this.cityEn === other.cityEn &&
      this.postalCode === other.postalCode &&
      this.countryCode === other.countryCode
    );
  }
}
