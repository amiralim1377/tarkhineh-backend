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
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
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
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
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

    return this.unitOfWork.execute(async (context) => {
      // Check management authority before querying the Role.
      // This prevents unauthorized callers from probing Role IDs.
      const managementContext =
        await this.authorization.getEffectiveAuthorizationContext(
          {
            userId: actorUserId,
            organizationId,
          },
          context.authorizationSnapshotReader,
        );

      if (
        !managementContext.permissionCodes.includes(
          PERMISSION_CODE.ORGANIZATION_ROLES_UPDATE,
        )
      ) {
        throw new AccessControlForbiddenError(
          DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
        );
      }

      // The repository lookup is tenant-scoped and transaction-bound.
      const role = await context.roleRepository.findById(
        organizationId,
        roleId,
      );

      if (!role) {
        throw new RoleNotFoundError(organizationId, roleId);
      }

      // Apply requested changes only to the loaded aggregate.
      if (permissionCodes !== undefined) {
        role.replacePermissionCodes(permissionCodes);

        // Delegation must be checked whenever the Permission set is supplied,
        // including when an empty array is supplied.
        const actorEffectivePermissionCodes =
          await this.authorization.getEffectiveDelegationPermissionCodes(
            {
              userId: actorUserId,
              organizationId,
              assignmentTarget: role.getAssignmentTarget(),
            },
            context.authorizationSnapshotReader,
          );

        const delegationDecision = this.delegationPolicy.canComposeRole({
          role,
          organizationId,
          operation: 'UPDATE',
          actorEffectivePermissionCodes,
        });

        if (!delegationDecision.allowed) {
          throw new AccessControlForbiddenError(delegationDecision.reasonCode);
        }
      }

      if (name !== undefined || description !== undefined) {
        role.updateDetails(
          name ?? role.getName(),
          description === undefined ? role.getDescription() : description,
        );
      }

      // The adapter must persist Role + complete RolePermission set atomically.
      await context.roleRepository.update(role);

      return { roleId: role.getId().getValue() };
    });
  }
}
