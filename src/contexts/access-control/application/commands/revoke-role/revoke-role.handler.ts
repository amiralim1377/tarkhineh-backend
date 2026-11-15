import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleAssignmentRevocationError } from '../../errors/invalid-role-assignment-revocation.error.js';
import { RoleAssignmentNotFoundError } from '../../errors/role-assignment-not-found.error.js';
import {
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  RevokeRoleCommand,
  type RevokeRoleResult,
} from './revoke-role.command.js';

@CommandHandler(RevokeRoleCommand)
export class RevokeRoleHandler
  implements ICommandHandler<RevokeRoleCommand, RevokeRoleResult>
{
  constructor(
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
    private readonly authorization: AuthorizationApplicationService,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(command: RevokeRoleCommand): Promise<RevokeRoleResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();
    const assignmentId = command.input.assignmentId.trim();
    const branchContextWasProvided = command.input.branchId !== undefined;
    const branchId = command.input.branchId?.trim() || undefined;

    if (
      !organizationId ||
      !assignmentId ||
      (branchContextWasProvided && !branchId)
    ) {
      throw new RoleAssignmentNotFoundError();
    }

    return this.unitOfWork.execute(async (context) => {
      // Revocation reduces access. It requires management authority at the
      // target scope, but does not require delegation of the granted permissions.
      const authorizationContext =
        await this.authorization.getEffectiveAuthorizationContext(
          {
            userId: actorUserId,
            organizationId,
            ...(branchId === undefined ? {} : { branchId }),
          },
          context.authorizationSnapshotReader,
        );

      const managementPermission =
        branchId === undefined
          ? PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN
          : PERMISSION_CODE.BRANCH_ROLES_ASSIGN;

      if (
        !authorizationContext.permissionCodes.includes(managementPermission)
      ) {
        throw new AccessControlForbiddenError(managementPermission);
      }

      const assignment =
        await context.roleAssignmentRepository.findByIdForRevocation({
          organizationId,
          assignmentId,
          ...(branchId === undefined ? {} : { branchId }),
        });

      if (
        !assignment ||
        assignment.organizationId !== organizationId ||
        (branchId === undefined
          ? assignment.organizationMembershipId === null ||
            assignment.branchMembershipId !== null
          : assignment.branchMembershipId === null ||
            assignment.organizationMembershipId !== null)
      ) {
        throw new RoleAssignmentNotFoundError();
      }

      // Idempotent success: do not rewrite already-revoked history.
      if (assignment.isRevoked()) {
        return { assignmentId: assignment.id };
      }

      const revokedAt = this.clock.now();

      if (
        !(revokedAt instanceof Date) ||
        !Number.isFinite(revokedAt.getTime()) ||
        revokedAt < assignment.createdAt ||
        !assignment.revoke(revokedAt)
      ) {
        throw new InvalidRoleAssignmentRevocationError();
      }

      await context.roleAssignmentRepository.update(assignment);

      return { assignmentId: assignment.id };
    });
  }
}
