import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

import {
  InvalidRoleDataError,
  ROLE_DATA_ERROR_CODE,
} from '../errors/invalid-role-data.error.js';

import {
  isKnownPermissionCode,
  isPermissionCompatibleWithRoleAssignmentTarget,
} from '../rules/role-permission-scope.rule.js';

import {
  ROLE_ASSIGNMENT_TARGET,
  ROLE_DEFINITION_SOURCE,
  ROLE_STATUS,
  type RoleAssignmentTarget,
  type RoleDefinitionSource,
  type RoleStatus,
} from './role.types.js';

import {
  getSystemRoleDefinition,
  isSystemRoleCode,
} from './system-role-catalog.js';

import type { PermissionCode } from '../permissions/permission-catalog.js';

// ============================================================
// ROLE PROPS
// ============================================================

export interface CreateRoleProps {
  readonly id?: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly definitionSource: RoleDefinitionSource;
  readonly assignmentTarget: RoleAssignmentTarget;
  readonly organizationId?: string | null;
  readonly isAssignable: boolean;
  readonly status?: RoleStatus;
  readonly permissionCodes?: readonly string[];
}

// ============================================================
// ROLE ENTITY
// ============================================================

export class Role extends Entity<UniqueId> {
  private permissionCodes: readonly PermissionCode[];

  private constructor(
    id: UniqueId,
    private readonly code: string,
    private name: string,
    private description: string | null,
    private readonly definitionSource: RoleDefinitionSource,
    private readonly assignmentTarget: RoleAssignmentTarget,
    private readonly organizationId: string | null,
    private readonly assignable: boolean,
    private status: RoleStatus,
    permissionCodes: readonly PermissionCode[],
  ) {
    super(id);

    this.permissionCodes = Object.freeze([...permissionCodes]);
  }

  // ============================================================
  // CREATION
  // ============================================================

  static create(props: CreateRoleProps): Role {
    const code = props.code.trim();
    const name = props.name.trim();
    const organizationId = props.organizationId?.trim() || null;
    const description = props.description?.trim() || null;

    const status = props.status ?? ROLE_STATUS.ACTIVE;
    const permissionCodes = props.permissionCodes ?? [];

    if (!code) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.CODE_REQUIRED,
        'Role code cannot be empty.',
      );
    }

    if (!name) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.NAME_REQUIRED,
        'Role name cannot be empty.',
      );
    }

    if (!Object.hasOwn(ROLE_DEFINITION_SOURCE, props.definitionSource)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.DEFINITION_SOURCE_INVALID,
        'Role definition source is invalid.',
      );
    }

    if (!Object.hasOwn(ROLE_ASSIGNMENT_TARGET, props.assignmentTarget)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.ASSIGNMENT_TARGET_INVALID,
        'Role assignment target is invalid.',
      );
    }

    if (!Object.hasOwn(ROLE_STATUS, status)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.STATUS_INVALID,
        'Role status is invalid.',
      );
    }

    if (
      props.definitionSource === ROLE_DEFINITION_SOURCE.SYSTEM &&
      organizationId !== null
    ) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_ORGANIZATION_FORBIDDEN,
        'A System Role cannot belong to an Organization.',
      );
    }

    if (
      props.definitionSource === ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED &&
      organizationId === null
    ) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'An Organization-defined Role requires an Organization ID.',
      );
    }

    Role.validateSystemRoleConfiguration({
      code,
      definitionSource: props.definitionSource,
      assignmentTarget: props.assignmentTarget,
      isAssignable: props.isAssignable,
    });

    const validatedPermissionCodes = Role.validatePermissionCodes(
      props.assignmentTarget,
      permissionCodes,
    );

    return new Role(
      new UniqueId(props.id),
      code,
      name,
      description,
      props.definitionSource,
      props.assignmentTarget,
      organizationId,
      props.isAssignable,
      status,
      validatedPermissionCodes,
    );
  }

  // ============================================================
  // SYSTEM ROLE VALIDATION
  // ============================================================

  private static validateSystemRoleConfiguration(props: {
    readonly code: string;
    readonly definitionSource: RoleDefinitionSource;
    readonly assignmentTarget: RoleAssignmentTarget;
    readonly isAssignable: boolean;
  }): void {
    if (props.definitionSource === ROLE_DEFINITION_SOURCE.SYSTEM) {
      if (!isSystemRoleCode(props.code)) {
        throw new InvalidRoleDataError(
          ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_NOT_REGISTERED,
          `System Role "${props.code}" is not registered in the System Role Catalog.`,
        );
      }

      const definition = getSystemRoleDefinition(props.code);

      const configurationMatchesCatalog =
        props.assignmentTarget === definition.assignmentTarget &&
        props.isAssignable === definition.isAssignable;

      if (!configurationMatchesCatalog) {
        throw new InvalidRoleDataError(
          ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_CONFIGURATION_INVALID,
          `System Role "${props.code}" does not match its catalog definition.`,
        );
      }

      return;
    }

    if (isSystemRoleCode(props.code)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_CODE_RESERVED,
        `System Role "${props.code}" cannot be defined by an Organization.`,
      );
    }
  }

  // ============================================================
  // PERMISSION VALIDATION
  // ============================================================

  private static validatePermissionCodes(
    assignmentTarget: RoleAssignmentTarget,
    permissionCodes: readonly string[],
  ): PermissionCode[] {
    const uniqueCodes = [...new Set(permissionCodes)];
    const validatedCodes: PermissionCode[] = [];

    for (const permissionCode of uniqueCodes) {
      if (!isKnownPermissionCode(permissionCode)) {
        throw new InvalidRoleDataError(
          ROLE_DATA_ERROR_CODE.PERMISSION_UNKNOWN,
          `Role contains an unknown permission code: "${permissionCode}".`,
        );
      }

      if (
        !isPermissionCompatibleWithRoleAssignmentTarget(
          assignmentTarget,
          permissionCode,
        )
      ) {
        throw new InvalidRoleDataError(
          ROLE_DATA_ERROR_CODE.PERMISSION_RESOURCE_LEVEL_INCOMPATIBLE,
          `Permission "${permissionCode}" is incompatible with "${assignmentTarget}" assignment target.`,
        );
      }

      validatedCodes.push(permissionCode);
    }

    return validatedCodes;
  }

  // ============================================================
  // GETTERS
  // ============================================================

  getCode(): string {
    return this.code;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | null {
    return this.description;
  }

  getDefinitionSource(): RoleDefinitionSource {
    return this.definitionSource;
  }

  getAssignmentTarget(): RoleAssignmentTarget {
    return this.assignmentTarget;
  }

  getOrganizationId(): string | null {
    return this.organizationId;
  }

  isAssignable(): boolean {
    return this.assignable;
  }

  getStatus(): RoleStatus {
    return this.status;
  }

  getPermissionCodes(): readonly PermissionCode[] {
    return this.permissionCodes;
  }

  // ============================================================
  // ASSIGNMENT & AUTHORIZATION
  // ============================================================

  canBeAssignedThroughGenericWorkflow(): boolean {
    return this.status === ROLE_STATUS.ACTIVE && this.assignable;
  }

  isEffectiveForAuthorization(): boolean {
    return this.status === ROLE_STATUS.ACTIVE;
  }

  // ============================================================
  // MUTATIONS
  // ============================================================

  updateDetails(name: string, description?: string | null): void {
    this.assertActiveForMutation();

    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.NAME_REQUIRED,
        'Role name cannot be empty.',
      );
    }

    this.name = normalizedName;
    this.description = description?.trim() || null;
  }

  replacePermissionCodes(permissionCodes: readonly string[]): void {
    this.assertActiveForMutation();

    const validatedCodes = Role.validatePermissionCodes(
      this.assignmentTarget,
      permissionCodes,
    );

    this.permissionCodes = Object.freeze([...validatedCodes]);
  }

  archive(): void {
    this.status = ROLE_STATUS.ARCHIVED;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private assertActiveForMutation(): void {
    if (this.status !== ROLE_STATUS.ACTIVE) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.ROLE_ARCHIVED,
        'An archived Role cannot be modified.',
      );
    }
  }
}
