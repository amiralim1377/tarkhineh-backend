import { beforeEach, describe, expect, it } from 'vitest';

import {
  Organization,
  type CreateOrganizationInput,
  type OrganizationProps,
} from './organization.js';

import {
  ORGANIZATION_MANAGEMENT_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';

// Default valid input used by tests.
const validInput: CreateOrganizationInput = {
  id: 'organization-123',
  name: 'Tarkhineh',
  slug: 'tarkhineh',
  ownerUserId: 'user-123',
};

// System Under Test factory.
function createSut(input: Partial<CreateOrganizationInput> = {}) {
  return Organization.create({
    ...validInput,
    ...input,
  });
}

describe('Organization', () => {
  // ============================================
  // CREATE
  // ============================================

  describe('create', () => {
    it('creates an active organization with normalized data', () => {
      // ARRANGE
      const input: Partial<CreateOrganizationInput> = {
        name: '  Tarkhineh Restaurant  ',
        slug: 'TARKHINEH RESTAURANT',
        ownerUserId: ' user-123 ',
      };

      // ACT
      const organization = createSut(input);

      // ASSERT
      expect(organization.id).toBe('organization-123');
      expect(organization.name).toBe('Tarkhineh Restaurant');
      expect(organization.slug).toBe('tarkhineh-restaurant');
      expect(organization.ownerUserId).toBe('user-123');
      expect(organization.status).toBe('ACTIVE');
      expect(organization.isActive()).toBe(true);
    });

    it('generates an ID when ID is not provided', () => {
      // ARRANGE
      const input = {
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      // ACT
      const organization = Organization.create(input);

      // ASSERT
      expect(organization.id).toBeTruthy();
    });

    it('generates different IDs for different organizations', () => {
      // ARRANGE
      const firstInput = {
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      const secondInput = {
        name: 'Alborz Restaurant',
        slug: 'alborz-restaurant',
        ownerUserId: 'user-321',
      };

      // ACT
      const firstOrganization = Organization.create(firstInput);
      const secondOrganization = Organization.create(secondInput);

      // ASSERT
      expect(firstOrganization.id).toBeTruthy();
      expect(secondOrganization.id).toBeTruthy();
      expect(firstOrganization.id).not.toBe(secondOrganization.id);
    });

    it('rejects an empty organization name', () => {
      // ARRANGE
      const invalidInput = {
        name: '',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
      });
    });

    it('rejects an empty owner user ID', () => {
      // ARRANGE
      const invalidInput = {
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: '',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
      });
    });

    it('rejects an empty ID when explicitly provided', () => {
      // ARRANGE
      const invalidInput = {
        id: '   ',
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
      });
    });

    it('rejects an invalid organization slug', () => {
      // ARRANGE
      const invalidInput = {
        name: 'Tarkhineh Restaurant',
        slug: '@fcd3_!',
        ownerUserId: 'user-123',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
      });
    });
  });

  // ============================================
  // RECONSTITUTE
  // ============================================

  describe('reconstitute', () => {
    it('reconstitutes an existing organization', () => {
      // ARRANGE
      const existingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'ACTIVE',
      };

      // ACT
      const organization = Organization.reconstitute(existingOrganization);

      // ASSERT
      expect(organization).toBeInstanceOf(Organization);
      expect(organization.id).toBe(existingOrganization.id);
      expect(organization.name).toBe(existingOrganization.name);
      expect(organization.slug).toBe(existingOrganization.slug);
      expect(organization.ownerUserId).toBe(existingOrganization.ownerUserId);
      expect(organization.status).toBe(existingOrganization.status);
      expect(organization.isActive()).toBe(true);
    });

    it('preserves the suspended status', () => {
      // ARRANGE
      const existingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'SUSPENDED',
      };

      // ACT
      const organization = Organization.reconstitute(existingOrganization);

      // ASSERT
      expect(organization.status).toBe('SUSPENDED');
      expect(organization.isActive()).toBe(false);
    });

    it('rejects an empty organization ID', () => {
      // ARRANGE
      const invalidExistingOrganization: OrganizationProps = {
        id: '',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'SUSPENDED',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
      });
    });

    it('rejects an empty organization name', () => {
      // ARRANGE
      const invalidExistingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: '',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'SUSPENDED',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
      });
    });

    it('rejects an empty owner user ID', () => {
      // ARRANGE
      const invalidExistingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: '',
        status: 'SUSPENDED',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
      });
    });

    it('rejects an invalid organization status', () => {
      // ARRANGE
      const invalidExistingOrganization = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'INVALID_STATUS',
      } as unknown as OrganizationProps;

      let thrownError: unknown;

      // ACT
      try {
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.STATUS_INVALID,
      });
    });

    it('rejects an invalid organization slug', () => {
      // ARRANGE
      const invalidExistingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: '@**/-*/',
        ownerUserId: 'user-123',
        status: 'SUSPENDED',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
      });
    });

    it('rejects a non-canonical persisted slug', () => {
      // ARRANGE
      const invalidExistingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'TARKHINEH',
        ownerUserId: 'user-123',
        status: 'SUSPENDED',
      };

      let thrownError: unknown;

      // ACT
      try {
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      // ASSERT
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);
      expect(thrownError).toMatchObject({
        code: ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
      });
    });
  });

  // ============================================
  // GETTERS
  // ============================================

  describe('getters', () => {
    let organization: Organization;

    beforeEach(() => {
      organization = createSut();
    });

    it('returns the organization ID', () => {
      // ACT
      const organizationId = organization.id;

      // ASSERT
      expect(organizationId).toBe('organization-123');
    });

    it('returns the organization name', () => {
      // ACT
      const organizationName = organization.name;

      // ASSERT
      expect(organizationName).toBe('Tarkhineh');
    });

    it('returns the organization slug', () => {
      // ACT
      const organizationSlug = organization.slug;

      // ASSERT
      expect(organizationSlug).toBe('tarkhineh');
    });

    it('returns the owner user ID', () => {
      // ACT
      const ownerUserId = organization.ownerUserId;

      // ASSERT
      expect(ownerUserId).toBe('user-123');
    });

    it('returns the organization status', () => {
      // ACT
      const organizationStatus = organization.status;

      // ASSERT
      expect(organizationStatus).toBe('ACTIVE');
    });
  });

  // ============================================
  // RENAME
  // ============================================

  describe('rename', () => {
    let organization: Organization;

    beforeEach(() => {
      organization = createSut();
    });

    it('renames the organization', () => {
      // ACT
      organization.rename('Tarkhineh Restaurant');

      // ASSERT
      expect(organization.name).toBe('Tarkhineh Restaurant');
    });

    it('trims whitespace from the new name', () => {
      // ACT
      organization.rename('  Tarkhineh Restaurant  ');

      // ASSERT
      expect(organization.name).toBe('Tarkhineh Restaurant');
    });

    it('rejects an empty organization name', () => {
      // ACT & ASSERT
      expect(() => organization.rename('')).toThrowError(
        InvalidOrganizationDataError,
      );
    });

    it('does not change the name when validation fails', () => {
      // ACT
      expect(() => organization.rename('   ')).toThrowError(
        InvalidOrganizationDataError,
      );

      // ASSERT
      expect(organization.name).toBe('Tarkhineh');
    });
  });

  // ============================================
  // SUSPEND
  // ============================================

  describe('suspend', () => {
    let organization: Organization;

    beforeEach(() => {
      organization = createSut();
    });

    it('suspends an active organization', () => {
      // ACT
      const result = organization.suspend();

      // ASSERT
      expect(result).toBe(true);
      expect(organization.status).toBe('SUSPENDED');
      expect(organization.isActive()).toBe(false);
    });

    it('returns false when organization is already suspended', () => {
      // ARRANGE
      organization.suspend();

      // ACT
      const result = organization.suspend();

      // ASSERT
      expect(result).toBe(false);
    });

    it('does not change an already suspended organization', () => {
      // ARRANGE
      organization.suspend();

      // ACT
      organization.suspend();

      // ASSERT
      expect(organization.status).toBe('SUSPENDED');
    });
  });

  // ============================================
  // ACTIVATE
  // ============================================

  describe('activate', () => {
    let organization: Organization;

    beforeEach(() => {
      organization = createSut();
    });

    it('activates a suspended organization', () => {
      // ARRANGE
      organization.suspend();

      // ACT
      const result = organization.activate();

      // ASSERT
      expect(result).toBe(true);
      expect(organization.status).toBe('ACTIVE');
      expect(organization.isActive()).toBe(true);
    });

    it('returns false when organization is already active', () => {
      // ACT
      const result = organization.activate();

      // ASSERT
      expect(result).toBe(false);
    });

    it('does not change an already active organization', () => {
      // ACT
      organization.activate();

      // ASSERT
      expect(organization.status).toBe('ACTIVE');
    });
  });

  // ============================================
  // IS ACTIVE
  // ============================================

  describe('isActive', () => {
    let organization: Organization;

    beforeEach(() => {
      organization = createSut();
    });

    it('returns true for an active organization', () => {
      // ACT
      const result = organization.isActive();

      // ASSERT
      expect(result).toBe(true);
    });

    it('returns false for a suspended organization', () => {
      // ARRANGE
      organization.suspend();

      // ACT
      const result = organization.isActive();

      // ASSERT
      expect(result).toBe(false);
    });
  });
});
