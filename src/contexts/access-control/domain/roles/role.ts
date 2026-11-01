import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  InvalidRoleDataError,
  ROLE_DATA_ERROR_CODE,
} from '../errors/invalid-role-data.error.js';
import {
  isKnownPermissionCode,
  isPermissionCompatibleWithRoleAssignmentScope,
} from '../rules/role-permission-scope.rule.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  ROLE_DEFINITION_SCOPE,
  ROLE_STATUS,
  type RoleAssignmentScope,
  type RoleDefinitionScope,
  type RoleStatus,
} from './role.types.js';
import type { PermissionCode } from '../permissions/permission-catalog.js';

export interface CreateRoleProps {
  readonly id?: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly definitionScope: RoleDefinitionScope;
  readonly assignmentScope: RoleAssignmentScope;
  readonly organizationId?: string | null;
  readonly isAssignable: boolean;
  readonly status?: RoleStatus;
  readonly permissionCodes?: readonly string[];
}

const ORGANIZATION_OWNER_CODE = 'ORGANIZATION_OWNER';
const BRANCH_MANAGER_CODE = 'BRANCH_MANAGER';

export class Role extends Entity<UniqueId> {
  private permissionCodes: readonly PermissionCode[];

  private constructor(
    id: UniqueId,
    private readonly code: string,
    private readonly name: string,
    private readonly description: string | null,
    private readonly definitionScope: RoleDefinitionScope,
    private readonly assignmentScope: RoleAssignmentScope,
    private readonly organizationId: string | null,
    private readonly assignable: boolean,
    private status: RoleStatus,
    permissionCodes: readonly PermissionCode[],
  ) {
    super(id);
    this.permissionCodes = Object.freeze([...permissionCodes]);
  }

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

    if (!Object.hasOwn(ROLE_DEFINITION_SCOPE, props.definitionScope)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.DEFINITION_SCOPE_INVALID,
        'Role definition scope is invalid.',
      );
    }

    if (!Object.hasOwn(ROLE_ASSIGNMENT_SCOPE, props.assignmentScope)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.ASSIGNMENT_SCOPE_INVALID,
        'Role assignment scope is invalid.',
      );
    }

    if (!Object.hasOwn(ROLE_STATUS, status)) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.STATUS_INVALID,
        'Role status is invalid.',
      );
    }

    if (
      props.definitionScope === ROLE_DEFINITION_SCOPE.SYSTEM &&
      organizationId !== null
    ) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.SYSTEM_ROLE_ORGANIZATION_FORBIDDEN,
        'A System Role cannot belong to an Organization.',
      );
    }

    if (
      props.definitionScope === ROLE_DEFINITION_SCOPE.ORGANIZATION &&
      organizationId === null
    ) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'An Organization-defined Role requires an Organization ID.',
      );
    }

    Role.validateReservedRoleConfiguration({
      code,
      definitionScope: props.definitionScope,
      assignmentScope: props.assignmentScope,
      isAssignable: props.isAssignable,
    });

    const validatedPermissionCodes = Role.validatePermissionCodes(
      props.assignmentScope,
      permissionCodes,
    );

    return new Role(
      new UniqueId(props.id),
      code,
      name,
      description,
      props.definitionScope,
      props.assignmentScope,
      organizationId,
      props.isAssignable,
      status,
      validatedPermissionCodes,
    );
  }

  private static validateReservedRoleConfiguration(props: {
    readonly code: string;
    readonly definitionScope: RoleDefinitionScope;
    readonly assignmentScope: RoleAssignmentScope;
    readonly isAssignable: boolean;
  }): void {
    if (
      props.code === ORGANIZATION_OWNER_CODE &&
      (props.definitionScope !== ROLE_DEFINITION_SCOPE.SYSTEM ||
        props.assignmentScope !== ROLE_ASSIGNMENT_SCOPE.ORGANIZATION ||
        props.isAssignable)
    ) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.OWNER_ROLE_RESERVED,
        'ORGANIZATION_OWNER must be a non-assignable System Organization Role.',
      );
    }

    if (
      props.code === BRANCH_MANAGER_CODE &&
      (props.definitionScope !== ROLE_DEFINITION_SCOPE.SYSTEM ||
        props.assignmentScope !== ROLE_ASSIGNMENT_SCOPE.BRANCH ||
        !props.isAssignable)
    ) {
      throw new InvalidRoleDataError(
        ROLE_DATA_ERROR_CODE.BRANCH_MANAGER_ROLE_RESERVED,
        'BRANCH_MANAGER must be an assignable System Branch Role.',
      );
    }
  }

  private static validatePermissionCodes(
    assignmentScope: RoleAssignmentScope,
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
        !isPermissionCompatibleWithRoleAssignmentScope(
          assignmentScope,
          permissionCode,
        )
      ) {
        throw new InvalidRoleDataError(
          ROLE_DATA_ERROR_CODE.PERMISSION_SCOPE_INCOMPATIBLE,
          `Permission "${permissionCode}" is incompatible with "${assignmentScope}" assignment scope.`,
        );
      }

      validatedCodes.push(permissionCode);
    }

    return validatedCodes;
  }

  getCode(): string {
    return this.code;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | null {
    return this.description;
  }

  getDefinitionScope(): RoleDefinitionScope {
    return this.definitionScope;
  }

  getAssignmentScope(): RoleAssignmentScope {
    return this.assignmentScope;
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

  /**
   * Generic assignment workflows must not assign reserved or archived roles.
   * Owner creation and transfer belong to their dedicated workflows.
   */
  canBeAssignedThroughGenericWorkflow(): boolean {
    return (
      this.status === ROLE_STATUS.ACTIVE &&
      this.assignable &&
      this.code !== ORGANIZATION_OWNER_CODE
    );
  }

  isEffectiveForAuthorization(): boolean {
    return this.status === ROLE_STATUS.ACTIVE;
  }

  /**
   * Replaces the complete permission set after validating every code
   * against the registry and the Role's immutable assignment scope.
   */
  replacePermissionCodes(permissionCodes: readonly string[]): void {
    const validatedCodes = Role.validatePermissionCodes(
      this.assignmentScope,
      permissionCodes,
    );

    this.permissionCodes = Object.freeze([...validatedCodes]);
  }

  archive(): void {
    this.status = ROLE_STATUS.ARCHIVED;
  }
}
