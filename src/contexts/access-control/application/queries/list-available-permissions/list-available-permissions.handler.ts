import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  PERMISSION_RESOURCE_LEVEL,
  type PermissionDefinition,
} from '../../../domain/permissions/permission-catalog.js';
import { ROLE_ASSIGNMENT_TARGET } from '../../../domain/roles/role.types.js';
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
    const { userId, organizationId, assignmentTarget } = query.input;
    const normalizedUserId = userId.trim();
    const normalizedOrganizationId = organizationId.trim();

    if (
      !normalizedUserId ||
      !normalizedOrganizationId ||
      !Object.values(ROLE_ASSIGNMENT_TARGET).some(
        (target) => target === assignmentTarget,
      )
    ) {
      return [];
    }

    const delegatedPermissionCodes =
      await this.authorization.getEffectiveDelegationPermissionCodes({
        userId: normalizedUserId,
        organizationId: normalizedOrganizationId,
        assignmentTarget,
      });

    const delegatedCodes = new Set(delegatedPermissionCodes);

    return Object.freeze(
      PERMISSION_DEFINITIONS.filter((permission) => {
        if (!permission.delegable || !delegatedCodes.has(permission.code)) {
          return false;
        }

        // Branch-target Roles may contain only Branch-level permissions.
        // Organization-target Roles may contain either resource level.
        return (
          assignmentTarget === ROLE_ASSIGNMENT_TARGET.ORGANIZATION ||
          permission.resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH
        );
      }),
    );
  }
}
