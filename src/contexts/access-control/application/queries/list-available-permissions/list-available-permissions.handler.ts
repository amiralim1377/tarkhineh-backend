import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  PERMISSION_TARGET_SCOPE,
  type PermissionDefinition,
} from '../../../domain/permissions/permission-catalog.js';
import { ROLE_ASSIGNMENT_SCOPE } from '../../../domain/roles/role.types.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { ListAvailablePermissionsQuery } from './list-available-permissions.query.js';
import { PERMISSION_DEFINITIONS } from '../../../domain/permissions/permission-catalog-derived.js';

/**
 * Lists registry permissions the actor may delegate into a custom Role.
 * This discovery Query does not replace delegation validation in mutation
 * handlers immediately before persistence.
 */
@QueryHandler(ListAvailablePermissionsQuery)
export class ListAvailablePermissionsHandler implements IQueryHandler<
  ListAvailablePermissionsQuery,
  readonly PermissionDefinition[]
> {
  constructor(
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(
    query: ListAvailablePermissionsQuery,
  ): Promise<readonly PermissionDefinition[]> {
    const { userId, organizationId, assignmentScope } = query.input;
    const normalizedUserId = userId.trim();
    const normalizedOrganizationId = organizationId.trim();

    if (
      !normalizedUserId ||
      !normalizedOrganizationId ||
      !Object.values(ROLE_ASSIGNMENT_SCOPE).some(
        (scope) => scope === assignmentScope,
      )
    ) {
      return [];
    }

    const delegatedPermissionCodes =
      await this.authorization.getEffectiveDelegationPermissionCodes({
        userId: normalizedUserId,
        organizationId: normalizedOrganizationId,
        assignmentScope,
      });

    const delegatedCodes = new Set(delegatedPermissionCodes);

    return Object.freeze(
      PERMISSION_DEFINITIONS.filter((permission) => {
        if (!permission.delegable || !delegatedCodes.has(permission.code)) {
          return false;
        }

        // Branch Roles may contain only Branch-target permissions.
        // Organization Roles may contain either target scope.
        return (
          assignmentScope === ROLE_ASSIGNMENT_SCOPE.ORGANIZATION ||
          permission.targetScope === PERMISSION_TARGET_SCOPE.BRANCH
        );
      }),
    );
  }
}
