import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PermissionDelegationPolicy } from '../../../domain/authorization/permission-delegation.policy.js';
import { PERMISSION_OVERRIDE_EFFECT } from '../../../domain/permission-overrides/permission-override.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidPermissionOverrideRequestError } from '../../errors/invalid-permission-override-request.error.js';
import {
  PERMISSION_OVERRIDE_REPOSITORY,
  type PermissionOverrideRepository,
} from '../../ports/permission-override.repository.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  RemovePermissionOverrideCommand,
  type RemovePermissionOverrideResult,
} from './remove-permission-override.command.js';

@CommandHandler(RemovePermissionOverrideCommand)
export class RemovePermissionOverrideHandler implements ICommandHandler<
  RemovePermissionOverrideCommand,
  RemovePermissionOverrideResult
> {
  private readonly delegationPolicy = new PermissionDelegationPolicy();

  constructor(
    @Inject(PERMISSION_OVERRIDE_REPOSITORY)
    private readonly overrides: PermissionOverrideRepository,
    private readonly authorization: AuthorizationApplicationService,
    @Inject(CLOCK)
    private readonly clock: Clock,
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

    // Management authority is checked before reading the target Override.
    const actorContext =
      await this.authorization.getEffectiveAuthorizationContext({
        userId: actorUserId,
        organizationId,
        branchId,
      });

    const delegationContext = {
      permissionCode,
      actorEffectivePermissionCodes: actorContext.permissionCodes,
    };

    // This first check validates the Branch permission and requires
    // override-management authority, without requiring delegation of the
    // target permission merely to remove an ALLOW override.
    const managementDecision = this.delegationPolicy.canSetPermissionOverride({
      ...delegationContext,
      effect: PERMISSION_OVERRIDE_EFFECT.DENY,
    });

    if (!managementDecision.allowed) {
      throw new AccessControlForbiddenError(managementDecision.reasonCode);
    }

    const existing = await this.overrides.findByUniqueKey({
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
      const delegationDecision = this.delegationPolicy.canSetPermissionOverride(
        {
          ...delegationContext,
          effect: PERMISSION_OVERRIDE_EFFECT.ALLOW,
        },
      );

      if (!delegationDecision.allowed) {
        throw new AccessControlForbiddenError(delegationDecision.reasonCode);
      }
    }

    await this.overrides.delete(existing);

    return {
      overrideId: existing.id,
      removed: true,
    };
  }
}
