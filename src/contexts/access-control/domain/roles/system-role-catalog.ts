import {
  ROLE_ASSIGNMENT_TARGET,
  ROLE_DEFINITION_SOURCE,
  type RoleAssignmentTarget,
} from './role.types.js';

// ============================================================
// SYSTEM ROLE CODES
// ============================================================

export const SYSTEM_ROLE_CODE = {
  ORGANIZATION_OWNER: 'ORGANIZATION_OWNER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  ORGANIZATION_ACCOUNTANT: 'ORGANIZATION_ACCOUNTANT',
  BRANCH_ACCOUNTANT: 'BRANCH_ACCOUNTANT',
} as const;

export type SystemRoleCode =
  (typeof SYSTEM_ROLE_CODE)[keyof typeof SYSTEM_ROLE_CODE];

// ============================================================
// SYSTEM ROLE DEFINITION
// ============================================================

export interface SystemRoleDefinition {
  readonly definitionSource: typeof ROLE_DEFINITION_SOURCE.SYSTEM;
  readonly assignmentTarget: RoleAssignmentTarget;
  readonly isAssignable: boolean;
}

export interface SystemRoleDefinitionWithCode extends SystemRoleDefinition {
  readonly code: SystemRoleCode;
}

// ============================================================
// SYSTEM ROLE CATALOG
// ============================================================

export const SYSTEM_ROLE_CATALOG = {
  [SYSTEM_ROLE_CODE.ORGANIZATION_OWNER]: {
    definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
    assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
    isAssignable: false,
  },

  [SYSTEM_ROLE_CODE.BRANCH_MANAGER]: {
    definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
    assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
    isAssignable: true,
  },

  [SYSTEM_ROLE_CODE.ORGANIZATION_ACCOUNTANT]: {
    definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
    assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
    isAssignable: true,
  },
  [SYSTEM_ROLE_CODE.BRANCH_ACCOUNTANT]: {
    definitionSource: ROLE_DEFINITION_SOURCE.SYSTEM,
    assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
    isAssignable: true,
  },
} as const satisfies Record<SystemRoleCode, SystemRoleDefinition>;

// ============================================================
// SYSTEM ROLE DEFINITIONS
// ============================================================

export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinitionWithCode[] =
  Object.freeze(
    (Object.keys(SYSTEM_ROLE_CATALOG) as SystemRoleCode[]).map((code) =>
      Object.freeze({
        code,
        ...SYSTEM_ROLE_CATALOG[code],
      }),
    ),
  );

// ============================================================
// SYSTEM ROLE HELPERS
// ============================================================

export function isSystemRoleCode(code: string): code is SystemRoleCode {
  return Object.hasOwn(SYSTEM_ROLE_CATALOG, code);
}

export function getSystemRoleDefinition(
  code: SystemRoleCode,
): SystemRoleDefinition {
  return SYSTEM_ROLE_CATALOG[code];
}
