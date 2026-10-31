import { describe, expect, it } from 'vitest';

import {
  Organization,
  OrganizationProps,
  type CreateOrganizationInput,
} from './organization.js';
import {
  ACCESS_CONTROL_ERROR_CODE,
  InvalidOrganizationDataError,
} from '../errors/invalid-organization-data.error.js';
import { tryCatch } from 'bullmq';

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
  // Keep your existing create test here.

  // ============================================
  // CREATE
  // ============================================

  describe('create', () => {
    it('creates an active organization with normalized data', () => {
      // Arrange
      const input: Partial<CreateOrganizationInput> = {
        name: '  Tarkhineh Restaurant  ',
        slug: 'TARKHINEH RESTAURANT',
        ownerUserId: ' user-123 ',
      };

      // Act
      const organization = createSut(input);

      // Assert
      expect(organization.id).toBe('organization-123');
      expect(organization.name).toBe('Tarkhineh Restaurant');
      expect(organization.slug).toBe('tarkhineh-restaurant');
      expect(organization.ownerUserId).toBe('user-123');
      expect(organization.status).toBe('ACTIVE');
      expect(organization.isActive()).toBe(true);
    });

    it('generates an ID when ID is not provided', () => {
      // Arrange
      const input = {
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      // Act
      const organization = Organization.create(input);

      // Assert
      expect(organization.id).toBeTruthy();
    });

    it('generates different IDs for different organizations', () => {
      // Arrange
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

      //  act
      const firstOrganization = Organization.create(firstInput);
      const secondOrganization = Organization.create(secondInput);

      // assert
      // Assert
      expect(firstOrganization.id).toBeTruthy();
      expect(secondOrganization.id).toBeTruthy();
      expect(firstOrganization.id).not.toBe(secondOrganization.id);
    });
    it('rejects an empty organization name', () => {
      // Arrange
      const invalidInput = {
        name: '',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      let thrownError: unknown;

      // Act
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // Assert
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
      });
    });

    it('rejects an empty owner user ID', () => {
      // Arrange
      const invalidInput = {
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: '',
      };

      let thrownError: unknown;

      // Act
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // Assert
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
      });
    });

    it('rejects an empty ID when explicitly provided', () => {
      // Arrange
      const invalidInput = {
        id: '   ',
        name: 'Tarkhineh Restaurant',
        slug: 'tarkhineh-restaurant',
        ownerUserId: 'user-123',
      };

      let thrownError: unknown;

      // Act
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // Assert
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
      });
    });

    it('rejects an invalid organization slug', () => {
      // Arrange
      const invalidInput = {
        name: 'Tarkhineh Restaurant',
        slug: '@fcd3_!',
        ownerUserId: 'user-123',
      };

      let thrownError: unknown;

      // Act
      try {
        Organization.create(invalidInput);
      } catch (error: unknown) {
        thrownError = error;
      }

      // Assert
      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
      });
    });
  });

  // ============================================
  // RECONSTITUTE
  // ============================================

  describe('reconstitute', () => {
    it('reconstitutes an existing organization', () => {
      const existingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'ACTIVE',
      };

      // Act
      const organization = Organization.reconstitute(existingOrganization);

      // assert
      expect(organization).toBeInstanceOf(Organization);
      expect(organization.id).toBe(existingOrganization.id);
      expect(organization.name).toBe(existingOrganization.name);
      expect(organization.slug).toBe(existingOrganization.slug);
      expect(organization.ownerUserId).toBe(existingOrganization.ownerUserId);
      expect(organization.status).toBe(existingOrganization.status);
    });

    it('preserves the original organization ID', () => {
      // ARRANGE
      const existingOrganization: OrganizationProps = {
        id: 'organization-123',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'ACTIVE',
      };

      //   act
      const organization = Organization.reconstitute(existingOrganization);

      //   assert
      expect(organization.id).toBe(existingOrganization.id);
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

      //   act
      const organization = Organization.reconstitute(existingOrganization);

      //   assert
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

      try {
        //   act
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.ID_REQUIRED,
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

      try {
        //   act
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.NAME_REQUIRED,
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

      try {
        //   act
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.OWNER_REQUIRED,
      });
    });

    it('rejects an invalid organization status', () => {
      // ARRANGE
      const invalidExistingOrganization = {
        id: 'organization-id',
        name: 'Tarkhineh',
        slug: 'tarkhineh',
        ownerUserId: 'user-123',
        status: 'INVALID_STATUS',
      } as unknown as OrganizationProps;

      let thrownError: unknown;

      try {
        //   act
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.STATUS_INVALID,
      });
    });

    it('rejects an invalid organization slug', () => {
      // ARRANGE
      const invalidExistingOrganization: OrganizationProps = {
        id: 'organization-id',
        name: 'Tarkhineh',
        slug: '@**/-*/',
        ownerUserId: 'user-123',
        status: 'SUSPENDED',
      };

      let thrownError: unknown;

      try {
        //   act
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
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

      try {
        //   act
        Organization.reconstitute(invalidExistingOrganization);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(InvalidOrganizationDataError);

      expect(thrownError).toMatchObject({
        code: ACCESS_CONTROL_ERROR_CODE.ORGANIZATION.SLUG_INVALID,
      });
    });
  });

  // ============================================
  // GETTERS
  // ============================================

  describe('getters', () => {
    it.todo('returns the organization ID');

    it.todo('returns the organization name');

    it.todo('returns the organization slug');

    it.todo('returns the owner user ID');

    it.todo('returns the organization status');
  });

  // ============================================
  // RENAME
  // ============================================

  describe('rename', () => {
    it.todo('renames the organization');

    it.todo('trims whitespace from the new name');

    it.todo('rejects an empty organization name');

    it.todo('does not change the name when validation fails');
  });

  // ============================================
  // SUSPEND
  // ============================================

  describe('suspend', () => {
    it.todo('suspends an active organization');

    it.todo('returns false when organization is already suspended');

    it.todo('does not change an already suspended organization');
  });

  // ============================================
  // ACTIVATE
  // ============================================

  describe('activate', () => {
    it.todo('activates a suspended organization');

    it.todo('returns false when organization is already active');

    it.todo('does not change an already active organization');
  });

  // ============================================
  // IS ACTIVE
  // ============================================

  describe('isActive', () => {
    it.todo('returns true for an active organization');

    it.todo('returns false for a suspended organization');
  });
});
