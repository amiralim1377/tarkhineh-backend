import {
  PERMISSION_CATALOG,
  PERMISSION_TARGET_SCOPE,
  type PermissionCode,
} from '../permissions/permission-catalog.js';

import type { RoleAssignmentScope } from '../roles/role.types.js';

export function isKnownPermissionCode(
  permissionCode: string,
): permissionCode is PermissionCode {
  return Object.hasOwn(PERMISSION_CATALOG, permissionCode);
}

/**
 * Organization-assigned roles can contain both Organization and Branch
 * permissions. Branch-assigned roles can contain only Branch permissions.
 */
export function isPermissionCompatibleWithRoleAssignmentScope(
  assignmentScope: RoleAssignmentScope,
  permissionCode: string,
): boolean {
  if (!isKnownPermissionCode(permissionCode)) {
    return false;
  }

  if (assignmentScope === 'ORGANIZATION') {
    return true;
  }

  return (
    PERMISSION_CATALOG[permissionCode].targetScope ===
    PERMISSION_TARGET_SCOPE.BRANCH
  );
}
