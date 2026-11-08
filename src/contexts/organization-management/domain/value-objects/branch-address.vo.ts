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

/**
 * Officially assigned ISO 3166-1 alpha-2 country codes.
 *
 * This list contains 249 codes.
 * Review it whenever ISO 3166/MA publishes an update.
 */
const ISO_3166_1_ALPHA_2_CODES: ReadonlySet<string> = new Set(
  `
    AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
    BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
    CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
    DE DJ DK DM DO DZ
    EC EE EG EH ER ES ET
    FI FJ FK FM FO FR
    GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
    HK HM HN HR HT HU
    ID IE IL IM IN IO IQ IR IS IT
    JE JM JO JP
    KE KG KH KI KM KN KP KR KW KY KZ
    LA LB LC LI LK LR LS LT LU LV LY
    MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
    NA NC NE NF NG NI NL NO NP NR NU NZ
    OM
    PA PE PF PG PH PK PL PM PN PR PS PT PW PY
    QA
    RE RO RS RU RW
    SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
    TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
    UA UG UM US UY UZ
    VA VC VE VG VI VN VU
    WF WS
    YE YT
    ZA ZM ZW
  `
    .trim()
    .split(/\s+/),
);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
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
    const rawInput: unknown = input;

    if (!isObjectRecord(rawInput)) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
        'Branch address input must be a valid object.',
      );
    }

    const rawAddressFa = rawInput.addressFa;
    const rawAddressEn = rawInput.addressEn;
    const rawCityFa = rawInput.cityFa;
    const rawCityEn = rawInput.cityEn;
    const rawPostalCode = rawInput.postalCode;
    const rawCountryCode = rawInput.countryCode;

    if (typeof rawAddressFa !== 'string') {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
        'Persian address must be a string.',
      );
    }

    if (typeof rawCityFa !== 'string') {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
        'Persian city must be a string.',
      );
    }

    if (
      !isOptionalString(rawAddressEn) ||
      !isOptionalString(rawCityEn) ||
      !isOptionalString(rawPostalCode)
    ) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
        'Optional address fields must be strings or null.',
      );
    }

    if (typeof rawCountryCode !== 'string') {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
        'Country code must be a string.',
      );
    }

    const addressFa = rawAddressFa.trim();
    const cityFa = rawCityFa.trim();
    const countryCode = rawCountryCode.trim().toUpperCase();

    const addressEn = rawAddressEn?.trim() || null;
    const cityEn = rawCityEn?.trim() || null;
    const postalCode = rawPostalCode?.trim() || null;

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

    if (!ISO_3166_1_ALPHA_2_CODES.has(countryCode)) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
        'Country code must be an assigned ISO 3166-1 alpha-2 code.',
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
    if (!(other instanceof BranchAddress)) {
      return false;
    }

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
