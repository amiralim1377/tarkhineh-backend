import { InvalidOrganizationMembershipDataError } from '../errors/invalid-organization-membership.error.js';
import {
  CreateOrganizationMembershipInput,
  OrganizationMembership,
} from './organization-membership.js';

describe('OrganizationMembership', () => {
  const validInput: CreateOrganizationMembershipInput = {
    organizationId: 'organizationId',
    userId: 'user-id',
  };
  describe('create', () => {
    it('should create an organization membership with a generated UUID', () => {
      //   act
      const organizationMembership = OrganizationMembership.create(validInput);

      // assert
      expect(organizationMembership).toBeInstanceOf(OrganizationMembership);

      expect(organizationMembership.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      expect(organizationMembership.id).not.toBe('');
    });

    it('should create a membership with INVITED status by default', () => {
      // act
      const organizationMembership = OrganizationMembership.create(validInput);

      // assert
      expect(organizationMembership.status).toBe('INVITED');
    });

    it('should create a membership with the supplied initial status', () => {
      const membership = OrganizationMembership.create({
        organizationId: 'organization-123',
        userId: 'user-123',
        status: 'ACTIVE',
      });
      //   ASSERT
      expect(membership.status).toBe('ACTIVE');
    });

    it('should normalize organization ID', () => {
      const membership = OrganizationMembership.create({
        organizationId: '   organization-123    ',
        userId: 'user-123',
        status: 'ACTIVE',
      });

      expect(membership.organizationId).toBe('organization-123');
    });

    it('should normalize user ID', () => {
      // arrange
      const membership = OrganizationMembership.create({
        organizationId: 'organization-123',
        userId: '   user-123    ',
        status: 'ACTIVE',
      });

      // assert
      expect(membership.userId).toBe('user-123');
    });

    it('should throw when organization ID is empty', () => {
      // arrange
      const input: CreateOrganizationMembershipInput = {
        organizationId: ' ',
        userId: 'user-123',
      };

      expect(() => OrganizationMembership.create(input)).toThrow(
        InvalidOrganizationMembershipDataError,
      );
    });

    it('should throw when user ID is empty', () => {
      // arrange
      const input: CreateOrganizationMembershipInput = {
        organizationId: 'organization-123',
        userId: '  ',
      };

      //   assert & act
      expect(() => OrganizationMembership.create(input)).toThrow(
        InvalidOrganizationMembershipDataError,
      );
    });

    it('should throw when supplied ID is empty', () => {
      //   assert & act
      expect(() =>
        OrganizationMembership.create({
          id: '   ',
          organizationId: 'organization-123',
          userId: 'user-123',
        }),
      ).toThrow(InvalidOrganizationMembershipDataError);
    });

    it('should throw when membership status is invalid', () => {
      expect(() =>
        OrganizationMembership.create({
          organizationId: 'organization-123',
          userId: 'user-123',
          status: 'invalid-status' as never,
        }),
      ).toThrow(InvalidOrganizationMembershipDataError);
    });

    it('should initialize createdAt and updatedAt', () => {
      const membership = OrganizationMembership.create({
        organizationId: 'organization-123',
        userId: 'user-123',
      });

      expect(membership.createdAt).toBeInstanceOf(Date);
      expect(membership.updatedAt).toBeInstanceOf(Date);
      expect(membership.createdAt.getTime()).toBeGreaterThan(0);
      expect(membership.updatedAt.getTime()).toBeGreaterThan(0);
    });
  });
});
