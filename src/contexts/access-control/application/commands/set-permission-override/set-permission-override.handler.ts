import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PermissionDelegationPolicy } from '../../../domain/authorization/permission-delegation.policy.js';
import {
  PermissionOverride,
  type PermissionOverrideEffect,
} from '../../../domain/permission-overrides/permission-override.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidPermissionOverrideRequestError } from '../../errors/invalid-permission-override-request.error.js';
import { PermissionOverrideTargetNotFoundError } from '../../errors/permission-override-target-not-found.error.js';
import {
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  SetPermissionOverrideCommand,
  type SetPermissionOverrideResult,
} from './set-permission-override.command.js';

@CommandHandler(SetPermissionOverrideCommand)
export class SetPermissionOverrideHandler
  implements
    ICommandHandler<
      SetPermissionOverrideCommand,
      SetPermissionOverrideResult
    >
{
  private readonly delegationPolicy = new PermissionDelegationPolicy();

  constructor(
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
    private readonly authorization: AuthorizationApplicationService,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(
    command: SetPermissionOverrideCommand,
  ): Promise<SetPermissionOverrideResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();
    const organizationMembershipId =
      command.input.organizationMembershipId.trim();
    const branchId = command.input.branchId.trim();
    const permissionCode = command.input.permissionCode.trim();
    const effect = command.input.effect as PermissionOverrideEffect;

    if (
      !organizationId ||
      !organizationMembershipId ||
      !branchId ||
      !permissionCode
    ) {
      throw new InvalidPermissionOverrideRequestError();
    }

    return this.unitOfWork.execute(async (context) => {
      // Authorization and persistence must share the same transaction.
      // ALLOW can grant access, so delegation is checked before target reads.
      const actorContext =
        await this.authorization.getEffectiveAuthorizationContext(
          {
            userId: actorUserId,
            organizationId,
            branchId,
          },
          context.authorizationSnapshotReader,
        );

      const decision = this.delegationPolicy.canSetPermissionOverride({
        permissionCode,
        effect,
        actorEffectivePermissionCodes: actorContext.permissionCodes,
      });

      if (!decision.allowed) {
        throw new AccessControlForbiddenError(decision.reasonCode);
      }

      // The repository verifies active Organization, Membership, and Branch
      // state. BranchMembership is deliberately not required here.
      const target =
        await context.permissionOverrideRepository.findActiveTarget({
          organizationId,
          organizationMembershipId,
          branchId,
        });

      if (!target) {
        throw new PermissionOverrideTargetNotFoundError();
      }

      const key = {
        organizationId,
        organizationMembershipId,
        branchId,
        permissionCode,
      };

      const existing =
        await context.permissionOverrideRepository.findByUniqueKey(key);

      if (existing) {
        // Repeating the same effect is an idempotent success.
        if (existing.effect === effect) {
          return {
            overrideId: existing.id,
            changed: false,
          };
        }

        const changed = existing.changeEffect(effect, this.clock.now());

        if (!changed) {
          return {
            overrideId: existing.id,
            changed: false,
          };
        }

        await context.permissionOverrideRepository.update(existing);

        return {
          overrideId: existing.id,
          changed: true,
        };
      }

      const override = PermissionOverride.create({
        organizationId,
        organizationMembership: target.organizationMembership,
        branch: target.branch,
        permissionCode,
        assignedById: actorUserId,
        effect,
        createdAt: this.clock.now(),
      });

      await context.permissionOverrideRepository.save(override);

      return {
        overrideId: override.id,
        changed: true,
      };
    });
  }
}
