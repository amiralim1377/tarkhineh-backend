export const ROLE_DEFINITION_SCOPE = {
  SYSTEM: 'SYSTEM',
  ORGANIZATION: 'ORGANIZATION',
} as const;

export type RoleDefinitionScope =
  (typeof ROLE_DEFINITION_SCOPE)[keyof typeof ROLE_DEFINITION_SCOPE];

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
