import { describe, expect, it } from 'vitest';

import {
  InvalidPermissionOverrideError,
  PERMISSION_OVERRIDE_ERROR_CODE,
} from '../errors/invalid-permission-override.error.js';
import { PERMISSION_CODE } from '../permissions/permission-catalog.js';
import {
  PermissionOverride,
  PERMISSION_OVERRIDE_EFFECT,
  type PermissionOverrideProps,
} from './permission-override.js';

const CREATED_AT = new Date('2026-10-30T10:00:00.000Z');
const UPDATED_AT = new Date('2026-10-30T11:00:00.000Z');

function createPermissionOverride(
  overrides: Partial<Parameters<typeof PermissionOverride.create>[0]> = {},
): PermissionOverride {
  return PermissionOverride.create({
    id: 'override-1',
    organizationId: 'organization-1',
    organizationMembership: {
      id: 'organization-membership-1',
      organizationId: 'organization-1',
    },
    branch: {
      id: 'branch-1',
      organizationId: 'organization-1',
    },
    permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
    assignedById: 'actor-1',
    effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function createPersistedOverride(
  overrides: Partial<PermissionOverrideProps> = {},
): PermissionOverrideProps {
  return {
    id: 'override-1',
    organizationId: 'organization-1',
    organizationMembership: {
      id: 'organization-membership-1',
      organizationId: 'organization-1',
    },
    branch: {
      id: 'branch-1',
      organizationId: 'organization-1',
    },
    permissionCode: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
    assignedById: 'actor-1',
    effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('PermissionOverride', () => {
  describe('creation and scope validation', () => {
    it('creates a branch-specific ALLOW override', () => {
      const override = createPermissionOverride();

      expect(override.id).toBe('override-1');
      expect(override.organizationId).toBe('organization-1');
      expect(override.organizationMembershipId).toBe(
        'organization-membership-1',
      );
      expect(override.branchId).toBe('branch-1');
      expect(override.permissionCode).toBe(
        PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      );
      expect(override.assignedById).toBe('actor-1');
      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.ALLOW);
      expect(override.createdAt).toEqual(CREATED_AT);
      expect(override.updatedAt).toEqual(CREATED_AT);
    });

    it('creates a branch-specific DENY override', () => {
      const override = createPermissionOverride({
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
      });

      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.DENY);
    });

    it('rejects an unknown Permission code', () => {
      expect(() =>
        createPermissionOverride({
          permissionCode: 'branch.unknown.permission',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.PERMISSION_UNKNOWN,
        }),
      );
    });

    it('rejects Organization-target Permissions', () => {
      expect(() =>
        createPermissionOverride({
          permissionCode: PERMISSION_CODE.ORGANIZATION_READ,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.PERMISSION_RESOURCE_LEVEL_INVALID,
        }),
      );
    });

    it('requires membership and branch to belong to the same Organization', () => {
      expect(() =>
        createPermissionOverride({
          branch: {
            id: 'branch-2',
            organizationId: 'organization-2',
          },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_MISMATCH,
        }),
      );

      expect(() =>
        createPermissionOverride({
          organizationMembership: {
            id: 'organization-membership-2',
            organizationId: 'organization-2',
          },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_MISMATCH,
        }),
      );
    });

    it('rejects a target whose organization differs from the supplied Organization', () => {
      expect(() =>
        createPermissionOverride({
          organizationId: 'organization-2',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_MISMATCH,
        }),
      );
    });

    it('rejects missing required identifiers', () => {
      expect(() =>
        createPermissionOverride({ organizationId: ' ' }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        }),
      );

      expect(() =>
        createPermissionOverride({
          organizationMembership: {
            id: ' ',
            organizationId: 'organization-1',
          },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ID_REQUIRED,
        }),
      );

      expect(() =>
        createPermissionOverride({
          branch: { id: ' ', organizationId: 'organization-1' },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.BRANCH_ID_REQUIRED,
        }),
      );

      expect(() =>
        createPermissionOverride({ assignedById: ' ' }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.ASSIGNED_BY_ID_REQUIRED,
        }),
      );
    });

    it('rejects invalid effects', () => {
      expect(() =>
        createPermissionOverride({
          effect: 'PERMIT' as 'ALLOW',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.EFFECT_INVALID,
        }),
      );
    });

    it('rejects invalid creation dates', () => {
      expect(() =>
        createPermissionOverride({
          createdAt: new Date(Number.NaN),
        }),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.CREATED_AT_INVALID,
        }),
      );
    });

    it('generates an ID when one is not supplied', () => {
      const first = createPermissionOverride({ id: undefined });
      const second = createPermissionOverride({ id: undefined });

      expect(first.id).toBeTruthy();
      expect(second.id).toBeTruthy();
      expect(first.equals(second)).toBe(false);
    });
  });

  describe('reconstitution', () => {
    it('reconstitutes a persisted override', () => {
      const override = PermissionOverride.reconstitute(
        createPersistedOverride(),
      );

      expect(override.id).toBe('override-1');
      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.ALLOW);
    });

    it('preserves a persisted DENY override', () => {
      const override = PermissionOverride.reconstitute(
        createPersistedOverride({
          effect: PERMISSION_OVERRIDE_EFFECT.DENY,
          updatedAt: UPDATED_AT,
        }),
      );

      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.DENY);
      expect(override.updatedAt).toEqual(UPDATED_AT);
    });

    it('rejects updatedAt before createdAt', () => {
      expect(() =>
        PermissionOverride.reconstitute(
          createPersistedOverride({
            updatedAt: new Date(CREATED_AT.getTime() - 1),
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
        }),
      );
    });

    it('rejects invalid updatedAt', () => {
      expect(() =>
        PermissionOverride.reconstitute(
          createPersistedOverride({
            updatedAt: new Date(Number.NaN),
          }),
        ),
      ).toThrowError(InvalidPermissionOverrideError);
    });
  });

  describe('effect changes', () => {
    it('changes ALLOW to DENY on the same logical override', () => {
      const override = createPermissionOverride();

      expect(
        override.changeEffect(PERMISSION_OVERRIDE_EFFECT.DENY, UPDATED_AT),
      ).toBe(true);

      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.DENY);
      expect(override.updatedAt).toEqual(UPDATED_AT);
      expect(override.uniquenessKey).toBe(
        'organization-membership-1:branch-1:branch.dashboard.read',
      );
    });

    it('changes DENY to ALLOW on the same logical override', () => {
      const override = createPermissionOverride({
        effect: PERMISSION_OVERRIDE_EFFECT.DENY,
      });

      expect(
        override.changeEffect(PERMISSION_OVERRIDE_EFFECT.ALLOW, UPDATED_AT),
      ).toBe(true);

      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.ALLOW);
    });

    it('does not update the timestamp when the effect is unchanged', () => {
      const override = createPermissionOverride();

      expect(
        override.changeEffect(PERMISSION_OVERRIDE_EFFECT.ALLOW, UPDATED_AT),
      ).toBe(false);

      expect(override.updatedAt).toEqual(CREATED_AT);
    });

    it('rejects an invalid effect during update', () => {
      const override = createPermissionOverride();

      expect(() =>
        override.changeEffect('PERMIT' as 'ALLOW', UPDATED_AT),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.EFFECT_INVALID,
        }),
      );
    });

    it('rejects an invalid or backward update timestamp', () => {
      const override = createPermissionOverride();

      expect(() =>
        override.changeEffect(
          PERMISSION_OVERRIDE_EFFECT.DENY,
          new Date(Number.NaN),
        ),
      ).toThrowError(InvalidPermissionOverrideError);

      expect(() =>
        override.changeEffect(
          PERMISSION_OVERRIDE_EFFECT.DENY,
          new Date(CREATED_AT.getTime() - 1),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
        }),
      );

      expect(override.effect).toBe(PERMISSION_OVERRIDE_EFFECT.ALLOW);
      expect(override.updatedAt).toEqual(CREATED_AT);
    });

    it('does not expose mutable Date instances', () => {
      const override = createPermissionOverride();
      const createdAt = override.createdAt;
      const updatedAt = override.updatedAt;

      createdAt.setUTCFullYear(2035);
      updatedAt.setUTCFullYear(2035);

      expect(override.createdAt).toEqual(CREATED_AT);
      expect(override.updatedAt).toEqual(CREATED_AT);
    });
  });
});
