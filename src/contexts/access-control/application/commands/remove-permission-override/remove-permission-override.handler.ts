import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PermissionDelegationPolicy } from '../../../domain/authorization/permission-delegation.policy.js';
import { PERMISSION_OVERRIDE_EFFECT } from '../../../domain/permission-overrides/permission-override.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidPermissionOverrideRequestError } from '../../errors/invalid-permission-override-request.error.js';
import {
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  RemovePermissionOverrideCommand,
  type RemovePermissionOverrideResult,
} from './remove-permission-override.command.js';

@CommandHandler(RemovePermissionOverrideCommand)
export class RemovePermissionOverrideHandler
  implements
    ICommandHandler<
      RemovePermissionOverrideCommand,
      RemovePermissionOverrideResult
    >
{
  private readonly delegationPolicy = new PermissionDelegationPolicy();

  constructor(
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(
    command: RemovePermissionOverrideCommand,
  ): Promise<RemovePermissionOverrideResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();
    const organizationMembershipId =
      command.input.organizationMembershipId.trim();
    const branchId = command.input.branchId.trim();
    const permissionCode = command.input.permissionCode.trim();

    if (
      !organizationId ||
      !organizationMembershipId ||
      !branchId ||
      !permissionCode
    ) {
      throw new InvalidPermissionOverrideRequestError();
    }

    return this.unitOfWork.execute(async (context) => {
      // Management authority is checked before reading the target Override.
      const actorContext =
        await this.authorization.getEffectiveAuthorizationContext(
          {
            userId: actorUserId,
            organizationId,
            branchId,
          },
          context.authorizationSnapshotReader,
        );

      const delegationContext = {
        permissionCode,
        actorEffectivePermissionCodes: actorContext.permissionCodes,
      };

      // This validates the Branch permission and override-management
      // authority without requiring delegation of the target permission.
      const managementDecision = this.delegationPolicy.canSetPermissionOverride(
        {
          ...delegationContext,
          effect: PERMISSION_OVERRIDE_EFFECT.DENY,
        },
      );

      if (!managementDecision.allowed) {
        throw new AccessControlForbiddenError(managementDecision.reasonCode);
      }

      const existing =
        await context.permissionOverrideRepository.findByUniqueKey({
          organizationId,
          organizationMembershipId,
          branchId,
          permissionCode,
        });

      // Removing a non-existent Override is an idempotent success.
      if (!existing) {
        return {
          overrideId: null,
          removed: false,
        };
      }

      // Removing DENY can restore the underlying permission. Require the
      // actor to hold that permission, just as when granting an ALLOW.
      if (existing.effect === PERMISSION_OVERRIDE_EFFECT.DENY) {
        const delegationDecision =
          this.delegationPolicy.canSetPermissionOverride({
            ...delegationContext,
            effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
          });

        if (!delegationDecision.allowed) {
          throw new AccessControlForbiddenError(
            delegationDecision.reasonCode,
          );
        }
      }

      await context.permissionOverrideRepository.delete(existing);

      return {
        overrideId: existing.id,
        removed: true,
      };
    });
  }
}
