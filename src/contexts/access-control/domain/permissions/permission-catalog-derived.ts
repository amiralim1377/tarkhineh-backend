import {
  PERMISSION_CATALOG,
  PERMISSION_RESOURCE_LEVEL,
} from './permission-catalog.js';

import type {
  PermissionCode,
  PermissionDefinition,
} from './permission-catalog.js';

// ============================================================
// PERMISSION DEFINITIONS
// ============================================================

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = (
  Object.keys(PERMISSION_CATALOG) as PermissionCode[]
).map((code) => ({
  code,
  ...PERMISSION_CATALOG[code],
}));

// ============================================================
// DELEGABILITY HELPERS
// ============================================================

export const DELEGABLE_PERMISSIONS: readonly PermissionCode[] =
  PERMISSION_DEFINITIONS.filter((permission) => permission.delegable).map(
    (permission) => permission.code,
  );

export const NON_DELEGABLE_PERMISSIONS: readonly PermissionCode[] =
  PERMISSION_DEFINITIONS.filter((permission) => !permission.delegable).map(
    (permission) => permission.code,
  );

// ============================================================
// PERMISSION RESOURCE LEVEL HELPERS
// ============================================================

export const ORGANIZATION_RESOURCE_LEVEL_PERMISSIONS: readonly PermissionCode[] =
  PERMISSION_DEFINITIONS.filter(
    (permission) =>
      permission.resourceLevel === PERMISSION_RESOURCE_LEVEL.ORGANIZATION,
  ).map((permission) => permission.code);

export const BRANCH_RESOURCE_LEVEL_PERMISSIONS: readonly PermissionCode[] =
  PERMISSION_DEFINITIONS.filter(
    (permission) =>
      permission.resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH,
  ).map((permission) => permission.code);
