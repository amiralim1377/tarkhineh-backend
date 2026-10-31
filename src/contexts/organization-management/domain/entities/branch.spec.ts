import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Branch,
  type BranchProps,
  type BranchStatus,
  type CreateBranchInput,
} from './branch.js';

import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';

import { expectBranchDataError } from '../value-objects/branch-value-object.spec-helper.js';

// ============================================================
// TEST DATA
// ============================================================

const DEFAULT_INPUT: CreateBranchInput = {
  organizationId: 'organization-001',

  nameFa: 'شعبه مرکزی',
  nameEn: 'Central Branch',

  slug: 'central-branch',

  phoneNumber: '+989121234567',

  addressFa: 'خیابان ولیعصر، پلاک ۱۰',
  addressEn: 'Valiasr Street, No. 10',

  cityFa: 'تهران',
  cityEn: 'Tehran',

  postalCode: '1234567890',
  countryCode: 'ir',

  latitude: 35.6892,
  longitude: 51.389,

  timeZoneId: 'Asia/Tehran',
};

function createBranch(overrides: Partial<CreateBranchInput> = {}): Branch {
  return Branch.create({
    ...DEFAULT_INPUT,
    ...overrides,
  });
}

function createBranchProps(overrides: Partial<BranchProps> = {}): BranchProps {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    organizationId: 'organization-001',

    nameFa: 'شعبه مرکزی',
    nameEn: 'Central Branch',

    slug: 'central-branch',
    status: 'ACTIVE',

    phoneNumber: '+989121234567',

    addressFa: 'خیابان ولیعصر، پلاک ۱۰',
    addressEn: 'Valiasr Street, No. 10',

    cityFa: 'تهران',
    cityEn: 'Tehran',

    postalCode: '1234567890',
    countryCode: 'IR',

    latitude: 35.6892,
    longitude: 51.389,

    timeZoneId: 'Asia/Tehran',

    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T09:00:00.000Z'),

    ...overrides,
  };
}

// ============================================================
// BRANCH TESTS
// ============================================================

describe('Branch', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================
  // CREATE
  // ==========================================================

  describe('create', () => {
    it('should create a branch with all valid properties', () => {
      const branch = createBranch();

      expect(branch).toBeInstanceOf(Branch);

      expect(branch.organizationId).toBe('organization-001');

      expect(branch.nameFa).toBe('شعبه مرکزی');
      expect(branch.nameEn).toBe('Central Branch');

      expect(branch.slug).toBe('central-branch');
      expect(branch.status).toBe('ACTIVE');

      expect(branch.phoneNumber).toBe('+989121234567');

      expect(branch.addressFa).toBe('خیابان ولیعصر، پلاک ۱۰');
      expect(branch.addressEn).toBe('Valiasr Street, No. 10');

      expect(branch.cityFa).toBe('تهران');
      expect(branch.cityEn).toBe('Tehran');

      expect(branch.postalCode).toBe('1234567890');
      expect(branch.countryCode).toBe('IR');

      expect(branch.latitude).toBe(35.6892);
      expect(branch.longitude).toBe(51.389);

      expect(branch.timeZoneId).toBe('Asia/Tehran');
    });

    it('should generate a UUID when ID is not provided', () => {
      const branch = createBranch();

      expect(branch.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should use the provided ID', () => {
      const branch = createBranch({
        id: 'custom-branch-id',
      });

      expect(branch.id).toBe('custom-branch-id');
    });

    it('should trim the provided ID', () => {
      const branch = createBranch({
        id: '  custom-branch-id  ',
      });

      expect(branch.id).toBe('custom-branch-id');
    });

    it('should trim organization ID', () => {
      const branch = createBranch({
        organizationId: '  organization-001  ',
      });

      expect(branch.organizationId).toBe('organization-001');
    });

    it('should normalize branch name', () => {
      const branch = createBranch({
        nameFa: '  شعبه مرکزی  ',
        nameEn: '  Central Branch  ',
      });

      expect(branch.nameFa).toBe('شعبه مرکزی');
      expect(branch.nameEn).toBe('Central Branch');
    });

    it('should normalize branch slug', () => {
      const branch = createBranch({
        slug: '  CENTRAL BRANCH  ',
      });

      expect(branch.slug).toBe('central-branch');
    });

    it('should normalize address values', () => {
      const branch = createBranch({
        addressFa: '  خیابان ولیعصر  ',
        addressEn: '  Valiasr Street  ',
        cityFa: '  تهران  ',
        cityEn: '  Tehran  ',
        postalCode: ' 1234567890 ',
        countryCode: ' ir ',
      });

      expect(branch.addressFa).toBe('خیابان ولیعصر');
      expect(branch.addressEn).toBe('Valiasr Street');

      expect(branch.cityFa).toBe('تهران');
      expect(branch.cityEn).toBe('Tehran');

      expect(branch.postalCode).toBe('1234567890');
      expect(branch.countryCode).toBe('IR');
    });

    it('should trim time zone ID', () => {
      const branch = createBranch({
        timeZoneId: '  Asia/Tehran  ',
      });

      expect(branch.timeZoneId).toBe('Asia/Tehran');
    });

    it('should create branch with ACTIVE status by default', () => {
      const branch = createBranch();

      expect(branch.status).toBe('ACTIVE');
      expect(branch.isActive()).toBe(true);
    });

    it('should create an INACTIVE branch when explicitly requested', () => {
      const branch = createBranch({
        status: 'INACTIVE',
      });

      expect(branch.status).toBe('INACTIVE');
      expect(branch.isActive()).toBe(false);
    });

    it('should allow missing English name', () => {
      const branch = createBranch({
        nameEn: null,
      });

      expect(branch.nameEn).toBeNull();
    });

    it('should allow missing phone number', () => {
      const branch = createBranch({
        phoneNumber: null,
      });

      expect(branch.phoneNumber).toBeNull();
    });

    it('should allow missing location', () => {
      const branch = createBranch({
        latitude: null,
        longitude: null,
      });

      expect(branch.latitude).toBeNull();
      expect(branch.longitude).toBeNull();
    });

    it('should allow omitted optional location values', () => {
      const branch = createBranch({
        latitude: undefined,
        longitude: undefined,
      });

      expect(branch.latitude).toBeNull();
      expect(branch.longitude).toBeNull();
    });

    it('should allow missing optional address translations', () => {
      const branch = createBranch({
        addressEn: null,
        cityEn: null,
        postalCode: null,
      });

      expect(branch.addressEn).toBeNull();
      expect(branch.cityEn).toBeNull();
      expect(branch.postalCode).toBeNull();
    });

    it('should initialize createdAt and updatedAt with the same time', () => {
      const branch = createBranch();

      expect(branch.createdAt.getTime()).toBe(
        new Date('2026-01-01T10:00:00.000Z').getTime(),
      );

      expect(branch.updatedAt.getTime()).toBe(branch.createdAt.getTime());
    });

    // --------------------------------------------------------
    // INVALID INPUTS
    // --------------------------------------------------------

    it('should reject empty organization ID', () => {
      expectBranchDataError(
        () => createBranch({ organizationId: '   ' }),
        BRANCH_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject empty explicitly provided ID', () => {
      expectBranchDataError(
        () => createBranch({ id: '   ' }),
        BRANCH_ERROR_CODE.ID_REQUIRED,
      );
    });

    it('should reject empty Persian branch name', () => {
      expectBranchDataError(
        () => createBranch({ nameFa: '   ' }),
        BRANCH_ERROR_CODE.NAME_REQUIRED,
      );
    });

    it('should reject invalid branch slug', () => {
      expectBranchDataError(
        () => createBranch({ slug: '!!!invalid!!!' }),
        BRANCH_ERROR_CODE.SLUG_INVALID,
      );
    });

    it('should reject invalid branch status', () => {
      expectBranchDataError(
        () =>
          createBranch({
            status: 'SUSPENDED' as BranchStatus,
          }),
        BRANCH_ERROR_CODE.STATUS_INVALID,
      );
    });

    it('should reject incomplete location', () => {
      expectBranchDataError(
        () =>
          createBranch({
            latitude: 35.6892,
            longitude: null,
          }),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should reject invalid address', () => {
      expectBranchDataError(
        () => createBranch({ addressFa: '   ' }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject invalid country code', () => {
      expectBranchDataError(
        () => createBranch({ countryCode: 'IRN' }),
        BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
      );
    });

    it('should reject invalid phone number', () => {
      expectBranchDataError(
        () => createBranch({ phoneNumber: '09121234567' }),
        BRANCH_ERROR_CODE.PHONE_NUMBER_INVALID,
      );
    });

    it('should reject invalid time zone', () => {
      expectBranchDataError(
        () => createBranch({ timeZoneId: 'Invalid/TimeZone' }),
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
      );
    });
  });

  // ==========================================================
  // RECONSTITUTE
  // ==========================================================

  describe('reconstitute', () => {
    it('should reconstruct a branch from persisted properties', () => {
      const props = createBranchProps();

      const branch = Branch.reconstitute(props);

      expect(branch).toBeInstanceOf(Branch);

      expect(branch.id).toBe(props.id);
      expect(branch.organizationId).toBe(props.organizationId);

      expect(branch.nameFa).toBe(props.nameFa);
      expect(branch.nameEn).toBe(props.nameEn);

      expect(branch.slug).toBe(props.slug);
      expect(branch.status).toBe(props.status);

      expect(branch.phoneNumber).toBe(props.phoneNumber);

      expect(branch.addressFa).toBe(props.addressFa);
      expect(branch.addressEn).toBe(props.addressEn);

      expect(branch.cityFa).toBe(props.cityFa);
      expect(branch.cityEn).toBe(props.cityEn);

      expect(branch.postalCode).toBe(props.postalCode);
      expect(branch.countryCode).toBe(props.countryCode);

      expect(branch.latitude).toBe(props.latitude);
      expect(branch.longitude).toBe(props.longitude);

      expect(branch.timeZoneId).toBe(props.timeZoneId);

      expect(branch.createdAt).toEqual(props.createdAt);
      expect(branch.updatedAt).toEqual(props.updatedAt);
    });

    it('should reconstruct an INACTIVE branch', () => {
      const branch = Branch.reconstitute({
        ...createBranchProps(),
        status: 'INACTIVE',
      });

      expect(branch.status).toBe('INACTIVE');
      expect(branch.isActive()).toBe(false);
    });

    it('should preserve null optional values', () => {
      const branch = Branch.reconstitute(
        createBranchProps({
          nameEn: null,
          phoneNumber: null,
          addressEn: null,
          cityEn: null,
          postalCode: null,
          latitude: null,
          longitude: null,
        }),
      );

      expect(branch.nameEn).toBeNull();
      expect(branch.phoneNumber).toBeNull();

      expect(branch.addressEn).toBeNull();
      expect(branch.cityEn).toBeNull();
      expect(branch.postalCode).toBeNull();

      expect(branch.latitude).toBeNull();
      expect(branch.longitude).toBeNull();
    });

    it('should trim ID and organization ID', () => {
      const branch = Branch.reconstitute(
        createBranchProps({
          id: '  branch-001  ',
          organizationId: '  organization-001  ',
        }),
      );

      expect(branch.id).toBe('branch-001');
      expect(branch.organizationId).toBe('organization-001');
    });

    it('should reject empty branch ID', () => {
      expectBranchDataError(
        () => Branch.reconstitute(createBranchProps({ id: '   ' })),
        BRANCH_ERROR_CODE.ID_REQUIRED,
      );
    });

    it('should reject empty organization ID', () => {
      expectBranchDataError(
        () => Branch.reconstitute(createBranchProps({ organizationId: '   ' })),
        BRANCH_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
      );
    });

    it('should reject invalid status', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              status: 'SUSPENDED' as BranchStatus,
            }),
          ),
        BRANCH_ERROR_CODE.STATUS_INVALID,
      );
    });

    it('should reject non-canonical persisted slug', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(createBranchProps({ slug: 'Central Branch' })),
        BRANCH_ERROR_CODE.SLUG_INVALID,
      );
    });

    it('should reject invalid Persian branch name', () => {
      expectBranchDataError(
        () => Branch.reconstitute(createBranchProps({ nameFa: '   ' })),
        BRANCH_ERROR_CODE.NAME_REQUIRED,
      );
    });

    it('should reject invalid address', () => {
      expectBranchDataError(
        () => Branch.reconstitute(createBranchProps({ addressFa: '   ' })),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject invalid country code', () => {
      expectBranchDataError(
        () => Branch.reconstitute(createBranchProps({ countryCode: 'IRN' })),
        BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
      );
    });

    it('should reject invalid location', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              latitude: 35.6892,
              longitude: null,
            }),
          ),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should reject invalid phone number', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              phoneNumber: '09121234567',
            }),
          ),
        BRANCH_ERROR_CODE.PHONE_NUMBER_INVALID,
      );
    });

    it('should reject invalid time zone', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              timeZoneId: 'Invalid/TimeZone',
            }),
          ),
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
      );
    });

    it('should reject invalid createdAt', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              createdAt: new Date(Number.NaN),
            }),
          ),
        BRANCH_ERROR_CODE.STATUS_INVALID,
      );
    });

    it('should reject invalid updatedAt', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              updatedAt: new Date(Number.NaN),
            }),
          ),
        BRANCH_ERROR_CODE.STATUS_INVALID,
      );
    });

    it('should reject non-Date createdAt value', () => {
      expectBranchDataError(
        () =>
          Branch.reconstitute(
            createBranchProps({
              createdAt: 'invalid-date' as unknown as Date,
            }),
          ),
        BRANCH_ERROR_CODE.STATUS_INVALID,
      );
    });
  });

  // ==========================================================
  // GETTERS
  // ==========================================================

  describe('getters', () => {
    it('should expose all branch properties', () => {
      const branch = createBranch();

      expect(branch.id).toBeTruthy();
      expect(branch.organizationId).toBe('organization-001');

      expect(branch.nameFa).toBe('شعبه مرکزی');
      expect(branch.nameEn).toBe('Central Branch');

      expect(branch.slug).toBe('central-branch');
      expect(branch.status).toBe('ACTIVE');

      expect(branch.phoneNumber).toBe('+989121234567');

      expect(branch.addressFa).toBe('خیابان ولیعصر، پلاک ۱۰');
      expect(branch.addressEn).toBe('Valiasr Street, No. 10');

      expect(branch.cityFa).toBe('تهران');
      expect(branch.cityEn).toBe('Tehran');

      expect(branch.postalCode).toBe('1234567890');
      expect(branch.countryCode).toBe('IR');

      expect(branch.latitude).toBe(35.6892);
      expect(branch.longitude).toBe(51.389);

      expect(branch.timeZoneId).toBe('Asia/Tehran');
    });

    it('should return defensive copies of createdAt', () => {
      const branch = createBranch();

      const date = branch.createdAt;

      date.setFullYear(2000);

      expect(branch.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });

    it('should return defensive copies of updatedAt', () => {
      const branch = createBranch();

      const date = branch.updatedAt;

      date.setFullYear(2000);

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });
  });

  // ==========================================================
  // RENAME
  // ==========================================================

  describe('rename', () => {
    it('should update Persian and English names', () => {
      const branch = createBranch();

      branch.rename('شعبه شمالی', 'North Branch');

      expect(branch.nameFa).toBe('شعبه شمالی');
      expect(branch.nameEn).toBe('North Branch');
    });

    it('should preserve English name when it is omitted', () => {
      const branch = createBranch();

      branch.rename('شعبه شمالی');

      expect(branch.nameFa).toBe('شعبه شمالی');
      expect(branch.nameEn).toBe('Central Branch');
    });

    it('should remove English name when null is provided', () => {
      const branch = createBranch();

      branch.rename('شعبه شمالی', null);

      expect(branch.nameFa).toBe('شعبه شمالی');
      expect(branch.nameEn).toBeNull();
    });

    it('should normalize new names', () => {
      const branch = createBranch();

      branch.rename('  شعبه شمالی  ', '  North Branch  ');

      expect(branch.nameFa).toBe('شعبه شمالی');
      expect(branch.nameEn).toBe('North Branch');
    });

    it('should reject empty Persian name', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.rename('   '),
        BRANCH_ERROR_CODE.NAME_REQUIRED,
      );
    });

    it('should reject English name longer than 120 characters', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.rename('شعبه شمالی', 'A'.repeat(121)),
        BRANCH_ERROR_CODE.NAME_INVALID,
      );
    });

    it('should not update updatedAt when names are unchanged', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.rename('شعبه مرکزی', 'Central Branch');

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when names change', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.rename('شعبه شمالی');

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });
  });

  // ==========================================================
  // UPDATE ADDRESS
  // ==========================================================

  describe('updateAddress', () => {
    it('should update branch address', () => {
      const branch = createBranch();

      branch.updateAddress({
        addressFa: 'خیابان آزادی، پلاک ۲۰',
        addressEn: 'Azadi Street, No. 20',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '1111111111',
        countryCode: 'IR',
      });

      expect(branch.addressFa).toBe('خیابان آزادی، پلاک ۲۰');
      expect(branch.addressEn).toBe('Azadi Street, No. 20');

      expect(branch.cityFa).toBe('تهران');
      expect(branch.cityEn).toBe('Tehran');

      expect(branch.postalCode).toBe('1111111111');
      expect(branch.countryCode).toBe('IR');
    });

    it('should allow removing optional address values', () => {
      const branch = createBranch();

      branch.updateAddress({
        addressFa: 'خیابان آزادی',
        cityFa: 'تهران',
        countryCode: 'IR',
      });

      expect(branch.addressEn).toBeNull();
      expect(branch.cityEn).toBeNull();
      expect(branch.postalCode).toBeNull();
    });

    it('should normalize new address values', () => {
      const branch = createBranch();

      branch.updateAddress({
        addressFa: '  خیابان آزادی  ',
        addressEn: '  Azadi Street  ',
        cityFa: '  تهران  ',
        cityEn: '  Tehran  ',
        postalCode: ' 1111111111 ',
        countryCode: ' ir ',
      });

      expect(branch.addressFa).toBe('خیابان آزادی');
      expect(branch.addressEn).toBe('Azadi Street');
      expect(branch.cityFa).toBe('تهران');
      expect(branch.cityEn).toBe('Tehran');
      expect(branch.postalCode).toBe('1111111111');
      expect(branch.countryCode).toBe('IR');
    });

    it('should reject invalid address', () => {
      const branch = createBranch();

      expectBranchDataError(
        () =>
          branch.updateAddress({
            addressFa: '   ',
            cityFa: 'تهران',
            countryCode: 'IR',
          }),
        BRANCH_ERROR_CODE.ADDRESS_INVALID,
      );
    });

    it('should reject invalid country code', () => {
      const branch = createBranch();

      expectBranchDataError(
        () =>
          branch.updateAddress({
            addressFa: 'خیابان آزادی',
            cityFa: 'تهران',
            countryCode: 'IRN',
          }),
        BRANCH_ERROR_CODE.COUNTRY_CODE_INVALID,
      );
    });

    it('should not update updatedAt when address is unchanged', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updateAddress({
        addressFa: 'خیابان ولیعصر، پلاک ۱۰',
        addressEn: 'Valiasr Street, No. 10',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        postalCode: '1234567890',
        countryCode: 'IR',
      });

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when address changes', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updateAddress({
        addressFa: 'خیابان آزادی',
        cityFa: 'تهران',
        countryCode: 'IR',
      });

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });
  });

  // ==========================================================
  // UPDATE LOCATION
  // ==========================================================

  describe('updateLocation', () => {
    it('should update branch coordinates', () => {
      const branch = createBranch();

      branch.updateLocation(36.2605, 59.6168);

      expect(branch.latitude).toBe(36.2605);
      expect(branch.longitude).toBe(59.6168);
    });

    it('should remove branch coordinates when both values are null', () => {
      const branch = createBranch();

      branch.updateLocation(null, null);

      expect(branch.latitude).toBeNull();
      expect(branch.longitude).toBeNull();
    });

    it('should reject incomplete coordinates', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.updateLocation(35.6892, null),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should reject coordinates outside valid boundaries', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.updateLocation(91, 51),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should reject NaN coordinates', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.updateLocation(Number.NaN, 51),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should not update updatedAt when location is unchanged', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updateLocation(35.6892, 51.389);

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when location changes', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updateLocation(36.2605, 59.6168);

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });
  });

  // ==========================================================
  // UPDATE PHONE NUMBER
  // ==========================================================

  describe('updatePhoneNumber', () => {
    it('should update branch phone number', () => {
      const branch = createBranch();

      branch.updatePhoneNumber('+989351234567');

      expect(branch.phoneNumber).toBe('+989351234567');
    });

    it('should remove phone number when null is provided', () => {
      const branch = createBranch();

      branch.updatePhoneNumber(null);

      expect(branch.phoneNumber).toBeNull();
    });

    it('should reject invalid phone number', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.updatePhoneNumber('09121234567'),
        BRANCH_ERROR_CODE.PHONE_NUMBER_INVALID,
      );
    });

    it('should not update updatedAt when phone number is unchanged', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updatePhoneNumber('+989121234567');

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when phone number changes', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updatePhoneNumber('+989351234567');

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });
  });

  // ==========================================================
  // UPDATE TIME ZONE
  // ==========================================================

  describe('updateTimeZone', () => {
    it('should update branch time zone', () => {
      const branch = createBranch();

      branch.updateTimeZone('Europe/Istanbul');

      expect(branch.timeZoneId).toBe('Europe/Istanbul');
    });

    it('should normalize time zone value', () => {
      const branch = createBranch();

      branch.updateTimeZone('  Europe/Istanbul  ');

      expect(branch.timeZoneId).toBe('Europe/Istanbul');
    });

    it('should reject invalid time zone', () => {
      const branch = createBranch();

      expectBranchDataError(
        () => branch.updateTimeZone('Invalid/TimeZone'),
        BRANCH_ERROR_CODE.TIME_ZONE_INVALID,
      );
    });

    it('should not update updatedAt when time zone is unchanged', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updateTimeZone('Asia/Tehran');

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });

    it('should update updatedAt when time zone changes', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.updateTimeZone('Europe/Istanbul');

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });
  });

  // ==========================================================
  // ACTIVATE
  // ==========================================================

  describe('activate', () => {
    it('should activate an inactive branch', () => {
      const branch = createBranch({
        status: 'INACTIVE',
      });

      const result = branch.activate();

      expect(result).toBe(true);
      expect(branch.status).toBe('ACTIVE');
      expect(branch.isActive()).toBe(true);
    });

    it('should return false when branch is already active', () => {
      const branch = createBranch();

      const result = branch.activate();

      expect(result).toBe(false);
      expect(branch.status).toBe('ACTIVE');
    });

    it('should update updatedAt when branch is activated', () => {
      const branch = createBranch({
        status: 'INACTIVE',
      });

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.activate();

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });

    it('should not update updatedAt when branch is already active', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.activate();

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ==========================================================
  // DEACTIVATE
  // ==========================================================

  describe('deactivate', () => {
    it('should deactivate an active branch', () => {
      const branch = createBranch();

      const result = branch.deactivate();

      expect(result).toBe(true);
      expect(branch.status).toBe('INACTIVE');
      expect(branch.isActive()).toBe(false);
    });

    it('should return false when branch is already inactive', () => {
      const branch = createBranch({
        status: 'INACTIVE',
      });

      const result = branch.deactivate();

      expect(result).toBe(false);
      expect(branch.status).toBe('INACTIVE');
    });

    it('should update updatedAt when branch is deactivated', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.deactivate();

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));
    });

    it('should not update updatedAt when branch is already inactive', () => {
      const branch = createBranch({
        status: 'INACTIVE',
      });

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.deactivate();

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
    });
  });

  // ==========================================================
  // IS ACTIVE
  // ==========================================================

  describe('isActive', () => {
    it('should return true for active branch', () => {
      const branch = createBranch();

      expect(branch.isActive()).toBe(true);
    });

    it('should return false for inactive branch', () => {
      const branch = createBranch({
        status: 'INACTIVE',
      });

      expect(branch.isActive()).toBe(false);
    });
  });

  // ==========================================================
  // UPDATED AT
  // ==========================================================

  describe('updatedAt', () => {
    it('should update timestamp after multiple successful changes', () => {
      const branch = createBranch();

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.rename('شعبه شمالی');
      expect(branch.updatedAt).toEqual(new Date('2026-01-01T11:00:00.000Z'));

      vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

      branch.updatePhoneNumber('+989351234567');

      expect(branch.updatedAt).toEqual(new Date('2026-01-01T12:00:00.000Z'));

      expect(branch.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    });

    it('should not change createdAt after branch updates', () => {
      const branch = createBranch();

      const originalCreatedAt = branch.createdAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      branch.rename('شعبه شمالی');
      branch.deactivate();

      expect(branch.createdAt).toEqual(originalCreatedAt);
    });

    it('should not change timestamps after a failed update', () => {
      const branch = createBranch();

      const previousUpdatedAt = branch.updatedAt;

      vi.setSystemTime(new Date('2026-01-01T11:00:00.000Z'));

      expectBranchDataError(
        () => branch.rename('   '),
        BRANCH_ERROR_CODE.NAME_REQUIRED,
      );

      expect(branch.updatedAt).toEqual(previousUpdatedAt);
      expect(branch.nameFa).toBe('شعبه مرکزی');
    });
  });
});
