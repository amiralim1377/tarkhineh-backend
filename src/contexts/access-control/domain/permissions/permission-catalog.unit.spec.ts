import { describe, expect, it } from 'vitest';

import {
  PERMISSION_ACTION,
  PERMISSION_CATALOG,
  PERMISSION_CODE,
  PERMISSION_RESOURCE,
  PERMISSION_RESOURCE_LEVEL,
  type PermissionCode,
} from './permission-catalog.js';

import {
  PERMISSION_DEFINITIONS,
  DELEGABLE_PERMISSIONS,
  NON_DELEGABLE_PERMISSIONS,
  ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS,
  BRANCH_RESOURCE_LEVEL_PERMISSIONS,
} from './permission-catalog-derived.js';

const sortCodes = (codes: readonly string[]) => [...codes].sort();

const EXPECTED_PERMISSION_CODES: readonly PermissionCode[] = [
  PERMISSION_CODE.ORGANIZATION_READ,
  PERMISSION_CODE.ORGANIZATION_UPDATE,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_READ,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_UPDATE,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_SUSPEND,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_UPDATE,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_REMOVE,
  PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
  PERMISSION_CODE.ORGANIZATION_ROLES_READ,
  PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
  PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
  PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
  PERMISSION_CODE.BRANCH_DASHBOARD_READ,
  PERMISSION_CODE.BRANCH_STAFF_READ,
  PERMISSION_CODE.BRANCH_STAFF_INVITE,
  PERMISSION_CODE.BRANCH_STAFF_UPDATE,
  PERMISSION_CODE.BRANCH_STAFF_SUSPEND,
  PERMISSION_CODE.BRANCH_STAFF_REMOVE,
  PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
];

const EXPECTED_DELEGABLE_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSION_CODE.ORGANIZATION_READ,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_READ,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_UPDATE,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_UPDATE,
  PERMISSION_CODE.ORGANIZATION_ROLES_READ,
  PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
  PERMISSION_CODE.BRANCH_DASHBOARD_READ,
  PERMISSION_CODE.BRANCH_STAFF_READ,
  PERMISSION_CODE.BRANCH_STAFF_INVITE,
  PERMISSION_CODE.BRANCH_STAFF_UPDATE,
  PERMISSION_CODE.BRANCH_STAFF_SUSPEND,
  PERMISSION_CODE.BRANCH_STAFF_REMOVE,
  PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
];

const EXPECTED_NON_DELEGABLE_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSION_CODE.ORGANIZATION_UPDATE,
  PERMISSION_CODE.ORGANIZATION_BRANCHES_SUSPEND,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_REMOVE,
  PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
  PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
  PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
  PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE,
];

const EXPECTED_ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS: readonly PermissionCode[] =
  [
    PERMISSION_CODE.ORGANIZATION_READ,
    PERMISSION_CODE.ORGANIZATION_UPDATE,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_READ,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_UPDATE,
    PERMISSION_CODE.ORGANIZATION_BRANCHES_SUSPEND,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_UPDATE,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_REMOVE,
    PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN,
    PERMISSION_CODE.ORGANIZATION_ROLES_READ,
    PERMISSION_CODE.ORGANIZATION_ROLES_CREATE,
    PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
    PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE,
    PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE,
  ];

const EXPECTED_BRANCH_RESOURCE_LEVEL_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSION_CODE.BRANCH_DASHBOARD_READ,
  PERMISSION_CODE.BRANCH_STAFF_READ,
  PERMISSION_CODE.BRANCH_STAFF_INVITE,
  PERMISSION_CODE.BRANCH_STAFF_UPDATE,
  PERMISSION_CODE.BRANCH_STAFF_SUSPEND,
  PERMISSION_CODE.BRANCH_STAFF_REMOVE,
  PERMISSION_CODE.BRANCH_ROLES_ASSIGN,
];

describe('Permission Registry', () => {
  describe('permission codes', () => {
    it('contains exactly the 23 approved permission codes', () => {
      expect(PERMISSION_DEFINITIONS).toHaveLength(23);
      expect(sortCodes(Object.keys(PERMISSION_CATALOG))).toEqual(
        sortCodes(EXPECTED_PERMISSION_CODES),
      );
      expect(
        sortCodes(PERMISSION_DEFINITIONS.map((permission) => permission.code)),
      ).toEqual(sortCodes(EXPECTED_PERMISSION_CODES));
    });

    it('contains no duplicate permission codes', () => {
      const codes = PERMISSION_DEFINITIONS.map((permission) => permission.code);

      expect(new Set(codes).size).toBe(codes.length);
    });

    it('includes the code in every complete definition', () => {
      for (const permission of PERMISSION_DEFINITIONS) {
        expect(PERMISSION_CATALOG).toHaveProperty(permission.code);
        expect(permission.code).toBeTruthy();
      }
    });
  });

  describe('metadata completeness', () => {
    it('provides non-empty English and Persian names', () => {
      for (const permission of PERMISSION_DEFINITIONS) {
        expect(permission.name.en.trim().length).toBeGreaterThan(0);
        expect(permission.name.fa.trim().length).toBeGreaterThan(0);
      }
    });

    it('provides non-empty English and Persian descriptions', () => {
      for (const permission of PERMISSION_DEFINITIONS) {
        expect(permission.description.en.trim().length).toBeGreaterThan(0);
        expect(permission.description.fa.trim().length).toBeGreaterThan(0);
      }
    });

    it('uses only registered resource levels', () => {
      const validResourceLevels = Object.values(PERMISSION_RESOURCE_LEVEL);

      for (const permission of PERMISSION_DEFINITIONS) {
        expect(validResourceLevels).toContain(permission.resourceLevel);
      }
    });

    it('uses only registered resources', () => {
      const validResources = Object.values(PERMISSION_RESOURCE);

      for (const permission of PERMISSION_DEFINITIONS) {
        expect(validResources).toContain(permission.resource);
      }
    });

    it('uses only registered actions', () => {
      const validActions = Object.values(PERMISSION_ACTION);

      for (const permission of PERMISSION_DEFINITIONS) {
        expect(validActions).toContain(permission.action);
      }
    });

    it('defines delegability explicitly for every permission', () => {
      for (const permission of PERMISSION_DEFINITIONS) {
        expect(typeof permission.delegable).toBe('boolean');
      }
    });
  });

  describe('delegability policy', () => {
    it('contains exactly the 16 approved delegable permissions', () => {
      expect(DELEGABLE_PERMISSIONS).toHaveLength(16);
      expect(sortCodes(DELEGABLE_PERMISSIONS)).toEqual(
        sortCodes(EXPECTED_DELEGABLE_PERMISSIONS),
      );
    });

    it('contains exactly the 7 approved non-delegable permissions', () => {
      expect(NON_DELEGABLE_PERMISSIONS).toHaveLength(7);
      expect(sortCodes(NON_DELEGABLE_PERMISSIONS)).toEqual(
        sortCodes(EXPECTED_NON_DELEGABLE_PERMISSIONS),
      );
    });

    it('partitions all permissions without overlap', () => {
      const combined = [...DELEGABLE_PERMISSIONS, ...NON_DELEGABLE_PERMISSIONS];

      expect(combined).toHaveLength(23);
      expect(new Set(combined).size).toBe(23);
      expect(sortCodes(combined)).toEqual(sortCodes(EXPECTED_PERMISSION_CODES));
    });

    it('does not infer delegability from resource level', () => {
      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.BRANCH_DASHBOARD_READ].delegable,
      ).toBe(true);

      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.ORGANIZATION_UPDATE].delegable,
      ).toBe(false);
    });
  });

  describe('resource level distribution', () => {
    it('contains exactly the 16 approved Organization-level permissions', () => {
      expect(ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS).toHaveLength(16);
      expect(sortCodes(ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS)).toEqual(
        sortCodes(EXPECTED_ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS),
      );
    });

    it('contains exactly the 7 approved Branch-level permissions', () => {
      expect(BRANCH_RESOURCE_LEVEL_PERMISSIONS).toHaveLength(7);
      expect(sortCodes(BRANCH_RESOURCE_LEVEL_PERMISSIONS)).toEqual(
        sortCodes(EXPECTED_BRANCH_RESOURCE_LEVEL_PERMISSIONS),
      );
    });

    it('assigns only Branch-level permissions to the Branch resource groups', () => {
      for (const code of EXPECTED_BRANCH_RESOURCE_LEVEL_PERMISSIONS) {
        expect(PERMISSION_CATALOG[code].resourceLevel).toBe(
          PERMISSION_RESOURCE_LEVEL.BRANCH,
        );
      }
    });

    it('assigns only Organization-level permissions to the Organization resource groups', () => {
      for (const code of EXPECTED_ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS) {
        expect(PERMISSION_CATALOG[code].resourceLevel).toBe(
          PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
        );
      }
    });
  });

  describe('the five newly approved permissions', () => {
    it('defines organization.roles.read correctly', () => {
      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.ORGANIZATION_ROLES_READ],
      ).toMatchObject({
        resourceLevel: PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
        resource: PERMISSION_RESOURCE.ORGANIZATION_ROLES,
        action: PERMISSION_ACTION.READ,
        delegable: true,
      });
    });

    it('defines organization.roles.create correctly', () => {
      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.ORGANIZATION_ROLES_CREATE],
      ).toMatchObject({
        resourceLevel: PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
        resource: PERMISSION_RESOURCE.ORGANIZATION_ROLES,
        action: PERMISSION_ACTION.CREATE,
        delegable: false,
      });
    });

    it('defines organization.roles.update correctly', () => {
      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE],
      ).toMatchObject({
        resourceLevel: PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
        resource: PERMISSION_RESOURCE.ORGANIZATION_ROLES,
        action: PERMISSION_ACTION.UPDATE,
        delegable: false,
      });
    });

    it('defines organization.roles.archive correctly', () => {
      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE],
      ).toMatchObject({
        resourceLevel: PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
        resource: PERMISSION_RESOURCE.ORGANIZATION_ROLES,
        action: PERMISSION_ACTION.ARCHIVE,
        delegable: false,
      });
    });

    it('defines organization.members.permissions.manage correctly', () => {
      expect(
        PERMISSION_CATALOG[
          PERMISSION_CODE.ORGANIZATION_MEMBERS_PERMISSIONS_MANAGE
        ],
      ).toMatchObject({
        resourceLevel: PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
        resource: PERMISSION_RESOURCE.ORGANIZATION_MEMBERS_PERMISSIONS,
        action: PERMISSION_ACTION.MANAGE,
        delegable: false,
      });
    });
  });

  describe('specific delegation decisions', () => {
    it('keeps organization.roles.assign delegable', () => {
      expect(
        PERMISSION_CATALOG[PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN].delegable,
      ).toBe(true);
    });

    it('keeps all seven Branch permissions delegable', () => {
      for (const code of EXPECTED_BRANCH_RESOURCE_LEVEL_PERMISSIONS) {
        expect(PERMISSION_CATALOG[code].delegable).toBe(true);
      }
    });

    it('keeps the seven approved non-delegable permissions non-delegable', () => {
      for (const code of EXPECTED_NON_DELEGABLE_PERMISSIONS) {
        expect(PERMISSION_CATALOG[code].delegable).toBe(false);
      }
    });
  });
});
