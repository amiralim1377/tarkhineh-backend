import {
  PERMISSION_CATALOG,
  PERMISSION_RESOURCE_LEVEL,
  type PermissionCode,
} from '../permissions/permission-catalog.js';

import {
  ROLE_ASSIGNMENT_TARGET,
  type RoleAssignmentTarget,
} from '../roles/role.types.js';

export function isKnownPermissionCode(
  permissionCode: string,
): permissionCode is PermissionCode {
  return Object.hasOwn(PERMISSION_CATALOG, permissionCode);
}

/**
 * Roles with an Organization assignment target can contain both Organization
 * and Branch permissions. Roles with a Branch assignment target can contain
 * only Branch permissions.
 */
export function isPermissionCompatibleWithRoleAssignmentTarget(
  assignmentTarget: RoleAssignmentTarget,
  permissionCode: string,
): boolean {
  if (!isKnownPermissionCode(permissionCode)) {
    return false;
  }

  const permissionResourceLevel =
    PERMISSION_CATALOG[permissionCode].resourceLevel;

  switch (assignmentTarget) {
    case ROLE_ASSIGNMENT_TARGET.ORGANIZATION:
      return true;

    case ROLE_ASSIGNMENT_TARGET.BRANCH:
      return permissionResourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH;

    default:
      return false;
  }
}
