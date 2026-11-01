import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  DELEGATION_DECISION_REASON,
  PermissionDelegationPolicy,
} from '../../../domain/authorization/permission-delegation.policy.js';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleUpdateError } from '../../errors/invalid-role-update.error.js';
import { RoleNotFoundError } from '../../errors/role-not-found.error.js';
import {
  ROLE_REPOSITORY,
  type RoleRepository,
} from '../../ports/role.repository.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  UpdateRoleCommand,
  type UpdateRoleResult,
} from './update-role.command.js';

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<
  UpdateRoleCommand,
  UpdateRoleResult
> {
  private readonly delegationPolicy = new PermissionDelegationPolicy();

  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<UpdateRoleResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();
    const roleId = command.input.roleId.trim();
    const { name, description, permissionCodes } = command.input;

    const hasChanges =
      name !== undefined ||
      description !== undefined ||
      permissionCodes !== undefined;

    if (!organizationId || !roleId || !hasChanges) {
      throw new InvalidRoleUpdateError();
    }

    // Check management authority before querying the Role. This prevents
    // callers without tenant-level management rights from probing Role IDs.
    const managementContext =
      await this.authorization.getEffectiveAuthorizationContext({
        userId: actorUserId,
        organizationId,
      });

    if (
      !managementContext.permissionCodes.includes(
        PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
      )
    ) {
      throw new AccessControlForbiddenError(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
    }

    // The repository must scope this lookup to the supplied Organization.
    const role = await this.roles.findById(organizationId, roleId);

    if (!role) {
      throw new RoleNotFoundError(organizationId, roleId);
    }

    // Mutate only the loaded aggregate. Nothing is persisted before all
    // final permissions have passed the delegation policy.
    if (permissionCodes !== undefined) {
      role.replacePermissionCodes(permissionCodes);
    }

    if (name !== undefined || description !== undefined) {
      role.updateDetails(
        name ?? role.getName(),
        description === undefined ? role.getDescription() : description,
      );
    }

    const actorEffectivePermissionCodes =
      await this.authorization.getEffectiveDelegationPermissionCodes({
        userId: actorUserId,
        organizationId,
        assignmentScope: role.getAssignmentScope(),
      });

    const delegationDecision = this.delegationPolicy.canComposeRole({
      role,
      organizationId,
      operation: 'UPDATE',
      actorEffectivePermissionCodes,
    });

    if (!delegationDecision.allowed) {
      throw new AccessControlForbiddenError(delegationDecision.reasonCode);
    }

    // The adapter must atomically persist the aggregate and its complete
    // RolePermission relation set.
    await this.roles.update(role);

    return { roleId: role.getId().getValue() };
  }
}
