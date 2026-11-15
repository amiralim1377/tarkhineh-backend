// ============================================================
// ROLE DEFINITION SOURCE
// ============================================================

export const ROLE_DEFINITION_SOURCE = {
  SYSTEM: 'SYSTEM',
  ORGANIZATION_DEFINED: 'ORGANIZATION_DEFINED',
} as const;

export type RoleDefinitionSource =
  (typeof ROLE_DEFINITION_SOURCE)[keyof typeof ROLE_DEFINITION_SOURCE];

// ============================================================
// ROLE ASSIGNMENT TARGET
// ============================================================

export const ROLE_ASSIGNMENT_TARGET = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;

export type RoleAssignmentTarget =
  (typeof ROLE_ASSIGNMENT_TARGET)[keyof typeof ROLE_ASSIGNMENT_TARGET];

// ============================================================
// ROLE STATUS
// ============================================================

export const ROLE_STATUS = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type RoleStatus = (typeof ROLE_STATUS)[keyof typeof ROLE_STATUS];
