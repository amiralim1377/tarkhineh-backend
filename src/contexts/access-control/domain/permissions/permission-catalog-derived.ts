// ============================================================
// PERMISSION DEFINITIONS
// ============================================================

import {
  PERMISSION_CATALOG,
  PERMISSION_TARGET_SCOPE,
  PermissionCode,
  PermissionDefinition,
} from './permission-catalog.js';

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
// TARGET SCOPE HELPERS
// ============================================================

export const ORGANIZATION_TARGET_SCOPE_PERMISSIONS: readonly PermissionCode[] =
  PERMISSION_DEFINITIONS.filter(
    (permission) =>
      permission.targetScope === PERMISSION_TARGET_SCOPE.ORGANIZATION,
  ).map((permission) => permission.code);

export const BRANCH_TARGET_SCOPE_PERMISSIONS: readonly PermissionCode[] =
  PERMISSION_DEFINITIONS.filter(
    (permission) => permission.targetScope === PERMISSION_TARGET_SCOPE.BRANCH,
  ).map((permission) => permission.code);
