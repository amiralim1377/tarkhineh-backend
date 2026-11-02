export const ROLE_DEFINITION_SOURCE = {
  SYSTEM: 'SYSTEM',
  ORGANIZATION_DEFINED: 'ORGANIZATION_DEFINED',
} as const;

export type RoleDefinitionSource =
  (typeof ROLE_DEFINITION_SOURCE)[keyof typeof ROLE_DEFINITION_SOURCE];

export const ROLE_ASSIGNMENT_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;

export type RoleAssignmentScope =
  (typeof ROLE_ASSIGNMENT_SCOPE)[keyof typeof ROLE_ASSIGNMENT_SCOPE];

export const ROLE_STATUS = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type RoleStatus = (typeof ROLE_STATUS)[keyof typeof ROLE_STATUS];
