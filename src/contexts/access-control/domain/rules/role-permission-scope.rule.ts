import {
  PERMISSION_CATALOG,
  PERMISSION_TARGET_SCOPE,
  type PermissionCode,
} from '../permissions/permission-catalog.js';

import {
  ROLE_ASSIGNMENT_SCOPE,
  type RoleAssignmentScope,
} from '../roles/role.types.js';

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
  // Permission must exist in the catalog.
  if (!isKnownPermissionCode(permissionCode)) {
    return false;
  }

  const permissionScope = PERMISSION_CATALOG[permissionCode].targetScope;

  switch (assignmentScope) {
    case ROLE_ASSIGNMENT_SCOPE.ORGANIZATION:
      return true;

    case ROLE_ASSIGNMENT_SCOPE.BRANCH:
      return permissionScope === PERMISSION_TARGET_SCOPE.BRANCH;

    default:
      return false;
  }
}
