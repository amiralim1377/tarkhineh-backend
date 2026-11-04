import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  DELEGATION_DECISION_REASON,
  PermissionDelegationPolicy,
} from '../../../domain/authorization/permission-delegation.policy.js';
import {
  InvalidRoleAssignmentError,
  ROLE_ASSIGNMENT_ERROR_CODE,
} from '../../../domain/errors/invalid-role-assignment.error.js';
import { RoleAssignment } from '../../../domain/role-assignments/role-assignment.js';
import { ROLE_ASSIGNMENT_TARGET } from '../../../domain/roles/role.types.js';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { RoleAssignmentAlreadyExistsError } from '../../errors/role-assignment-already-exists.error.js';
import { RoleAssignmentTargetNotFoundError } from '../../errors/role-assignment-target-not-found.error.js';
import { RoleNotFoundError } from '../../errors/role-not-found.error.js';
import {
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  AssignRoleCommand,
  type AssignRoleResult,
} from './assign-role.command.js';

@CommandHandler(AssignRoleCommand)
export class AssignRoleHandler implements ICommandHandler<
  AssignRoleCommand,
  AssignRoleResult
> {
  private readonly delegationPolicy = new PermissionDelegationPolicy();

  constructor(
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
    private readonly authorization: AuthorizationApplicationService,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(command: AssignRoleCommand): Promise<AssignRoleResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();
    const roleId = command.input.roleId.trim();
    const organizationMembershipId =
      command.input.organizationMembershipId?.trim() || undefined;
    const branchMembershipId =
      command.input.branchMembershipId?.trim() || undefined;
    const branchId = command.input.branchId?.trim() || undefined;

    if (!organizationId || !roleId) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Organization and Role IDs are required.',
      );
    }

    const organizationTarget = organizationMembershipId !== undefined;
    const branchTarget =
      branchMembershipId !== undefined && branchId !== undefined;

    if (
      organizationTarget === branchTarget ||
      (branchMembershipId !== undefined) !== (branchId !== undefined)
    ) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.MEMBERSHIP_TARGET_INVALID,
        'Exactly one complete Organization or Branch membership target is required.',
      );
    }

    return this.unitOfWork.execute(async (context) => {
      // Resolve Actor authority in the exact target context.
      // This read uses the same transaction as all subsequent validation
      // and persistence operations.
      const actorEffectivePermissionCodes = organizationTarget
        ? await this.authorization.getEffectiveDelegationPermissionCodes(
            {
              userId: actorUserId,
              organizationId,
              assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
            },
            context.authorizationSnapshotReader,
          )
        : (
            await this.authorization.getEffectiveAuthorizationContext(
              {
                userId: actorUserId,
                organizationId,
                branchId: branchId!,
              },
              context.authorizationSnapshotReader,
            )
          ).permissionCodes;

      const requiredManagementPermission = organizationTarget
        ? PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN
        : PERMISSION_CODE.BRANCH_ROLES_ASSIGN;

      if (
        !actorEffectivePermissionCodes.includes(requiredManagementPermission)
      ) {
        throw new AccessControlForbiddenError(
          DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
        );
      }

      // Load only a Role that can be assigned in this Organization.
      const role = await context.roleRepository.findAssignableById(
        organizationId,
        roleId,
      );

      if (!role) {
        throw new RoleNotFoundError(organizationId, roleId);
      }

      const expectedAssignmentTarget = organizationTarget
        ? ROLE_ASSIGNMENT_TARGET.ORGANIZATION
        : ROLE_ASSIGNMENT_TARGET.BRANCH;

      if (role.getAssignmentTarget() !== expectedAssignmentTarget) {
        throw new InvalidRoleAssignmentError(
          ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNMENT_TARGET_MISMATCH,
          'Role assignment target does not match the supplied membership target.',
        );
      }
      const delegationDecision = this.delegationPolicy.canAssignRole({
        role,
        targetOrganizationId: organizationId,
        actorEffectivePermissionCodes,
      });

      if (!delegationDecision.allowed) {
        throw new AccessControlForbiddenError(delegationDecision.reasonCode);
      }

      // Target readers must verify ACTIVE status and tenant consistency.
      const organizationMembership = organizationTarget
        ? await context.roleAssignmentRepository.findActiveOrganizationMembership(
            organizationId,
            organizationMembershipId!,
          )
        : null;

      const branchMembership = branchTarget
        ? await context.roleAssignmentRepository.findActiveBranchMembership(
            organizationId,
            branchId!,
            branchMembershipId!,
          )
        : null;

      if (
        (organizationTarget && !organizationMembership) ||
        (branchTarget && !branchMembership)
      ) {
        throw new RoleAssignmentTargetNotFoundError();
      }

      // This is an early conflict check. PostgreSQL partial unique
      // constraints remain authoritative for concurrent requests.
      const duplicate =
        await context.roleAssignmentRepository.existsActiveForTarget({
          roleId: role.getId().getValue(),
          ...(organizationMembership === null
            ? {}
            : { organizationMembershipId: organizationMembership.id }),
          ...(branchMembership === null
            ? {}
            : { branchMembershipId: branchMembership.id }),
        });

      if (duplicate) {
        throw new RoleAssignmentAlreadyExistsError();
      }

      const assignment = RoleAssignment.create({
        role,
        organizationMembership,
        branchMembership,
        assignedById: actorUserId,
        createdAt: this.clock.now(),
      });

      await context.roleAssignmentRepository.save(assignment);

      return {
        assignmentId: assignment.getId().getValue(),
      };
    });
  }
}
