import { describe, expect, it } from 'vitest';

import {
  ACCESS_CONTROL_AUDIT_RESOURCE_TYPE,
  type AccessControlAuditResourceType,
} from '../access-control-audit-event.types.js';

import {
  AuditResourceReference,
  type CreateAuditResourceReferenceProps,
} from './audit-resource-reference.vo.js';
import {
  ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE,
  InvalidAccessControlAuditEventError,
} from '../../errors/invalid-access-control-audit-event.error.js';

function createAuditResource(
  overrides: Partial<CreateAuditResourceReferenceProps> = {},
): AuditResourceReference {
  return AuditResourceReference.create({
    type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.ROLE,
    id: 'role-1',
    ...overrides,
  });
}

describe('AuditResourceReference', () => {
  describe('creation', () => {
    it('creates a Role resource reference', () => {
      const resource = createAuditResource();

      expect(resource.getType()).toBe(ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.ROLE);
      expect(resource.getId()).toBe('role-1');
      expect(resource.hasId()).toBe(true);
    });

    it('creates a RoleAssignment resource reference', () => {
      const resource = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.ROLE_ASSIGNMENT,
        id: 'assignment-1',
      });

      expect(resource.getType()).toBe(
        ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.ROLE_ASSIGNMENT,
      );
      expect(resource.getId()).toBe('assignment-1');
    });

    it('creates a PermissionOverride resource reference', () => {
      const resource = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.PERMISSION_OVERRIDE,
        id: 'override-1',
      });

      expect(resource.getType()).toBe(
        ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.PERMISSION_OVERRIDE,
      );
      expect(resource.getId()).toBe('override-1');
    });

    it('creates a Permission resource reference', () => {
      const resource = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.PERMISSION,
        id: 'permission-1',
      });

      expect(resource.getType()).toBe(
        ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.PERMISSION,
      );
      expect(resource.getId()).toBe('permission-1');
    });

    it('normalizes the resource ID', () => {
      const resource = createAuditResource({
        id: '  role-1  ',
      });

      expect(resource.getId()).toBe('role-1');
    });

    it('rejects an unknown resource type', () => {
      expect(() =>
        createAuditResource({
          type: 'UNKNOWN' as AccessControlAuditResourceType,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_TYPE_INVALID,
        }),
      );
    });

    it('rejects an empty resource ID', () => {
      expect(() => createAuditResource({ id: '' })).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_ID_INVALID,
        }),
      );
    });

    it('rejects a whitespace-only resource ID', () => {
      expect(() => createAuditResource({ id: '   ' })).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_ID_INVALID,
        }),
      );
    });

    it('requires a resource ID for a Role', () => {
      expect(() => createAuditResource({ id: null })).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_ID_REQUIRED,
        }),
      );
    });

    it('requires a resource ID for a PermissionOverride', () => {
      expect(() =>
        createAuditResource({
          type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.PERMISSION_OVERRIDE,
          id: null,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_ID_REQUIRED,
        }),
      );
    });

    it('allows an unresolved Authorization resource', () => {
      const resource = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
        id: null,
      });

      expect(resource.getType()).toBe(
        ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
      );
      expect(resource.getId()).toBeNull();
      expect(resource.hasId()).toBe(false);
    });

    it('allows an Authorization resource with an ID', () => {
      const resource = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
        id: 'authorization-target-1',
      });

      expect(resource.getId()).toBe('authorization-target-1');
      expect(resource.hasId()).toBe(true);
    });

    it('allows an omitted ID for Authorization resource', () => {
      const resource = AuditResourceReference.create({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
      });

      expect(resource.getId()).toBeNull();
      expect(resource.hasId()).toBe(false);
    });

    it('throws an InvalidAccessControlAuditEventError for invalid data', () => {
      try {
        createAuditResource({ id: ' ' });
        expect.fail('Expected an error to be thrown.');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidAccessControlAuditEventError);
      }
    });
  });

  describe('equality', () => {
    it('considers two references with the same type and ID equal', () => {
      const first = createAuditResource();
      const second = createAuditResource();

      expect(first.equals(second)).toBe(true);
    });

    it('considers references with different IDs unequal', () => {
      const first = createAuditResource();
      const second = createAuditResource({ id: 'role-2' });

      expect(first.equals(second)).toBe(false);
    });

    it('considers references with different types unequal', () => {
      const first = createAuditResource();

      const second = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.PERMISSION,
      });

      expect(first.equals(second)).toBe(false);
    });

    it('considers two unresolved Authorization references equal', () => {
      const first = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
        id: null,
      });

      const second = createAuditResource({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
        id: null,
      });

      expect(first.equals(second)).toBe(true);
    });

    it('returns false when comparing with null', () => {
      const resource = createAuditResource();

      expect(resource.equals(null)).toBe(false);
    });

    it('returns false when comparing with undefined', () => {
      const resource = createAuditResource();

      expect(resource.equals(undefined)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('freezes the Value Object after creation', () => {
      const resource = createAuditResource();

      expect(Object.isFrozen(resource)).toBe(true);
    });
  });
});
