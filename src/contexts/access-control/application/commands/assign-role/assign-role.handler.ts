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
import { ROLE_ASSIGNMENT_SCOPE } from '../../../domain/roles/role.types.js';
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
  ROLE_REPOSITORY,
  type RoleRepository,
} from '../../ports/role.repository.js';
import {
  ROLE_ASSIGNMENT_REPOSITORY,
  type RoleAssignmentRepository,
} from '../../ports/role-assignment.repository.js';
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
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(ROLE_ASSIGNMENT_REPOSITORY)
    private readonly assignments: RoleAssignmentRepository,
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

    // Resolve Actor authority in the exact target context before reading
    // Role or membership records. This avoids target-data probing by actors
    // who do not hold the corresponding assignment-management permission.
    const actorEffectivePermissionCodes = organizationTarget
      ? await this.authorization.getEffectiveDelegationPermissionCodes({
          userId: actorUserId,
          organizationId,
          assignmentScope: ROLE_ASSIGNMENT_SCOPE.ORGANIZATION,
        })
      : (
          await this.authorization.getEffectiveAuthorizationContext({
            userId: actorUserId,
            organizationId,
            branchId: branchId!,
          })
        ).permissionCodes;

    const requiredManagementPermission = organizationTarget
      ? PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN
      : PERMISSION_CODE.BRANCH_ROLES_ASSIGN;

    if (!actorEffectivePermissionCodes.includes(requiredManagementPermission)) {
      throw new AccessControlForbiddenError(
        DELEGATION_DECISION_REASON.MANAGEMENT_PERMISSION_MISSING,
      );
    }

    const role = await this.roles.findAssignableById(organizationId, roleId);

    if (!role) {
      throw new RoleNotFoundError(organizationId, roleId);
    }

    const expectedScope = organizationTarget
      ? ROLE_ASSIGNMENT_SCOPE.ORGANIZATION
      : ROLE_ASSIGNMENT_SCOPE.BRANCH;

    if (role.getAssignmentScope() !== expectedScope) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNMENT_SCOPE_MISMATCH,
        'Role assignment scope does not match the supplied membership target.',
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

    // The target reader guarantees ACTIVE status and tenant consistency.
    const organizationMembership = organizationTarget
      ? await this.assignments.findActiveOrganizationMembership(
          organizationId,
          organizationMembershipId!,
        )
      : null;

    const branchMembership = branchTarget
      ? await this.assignments.findActiveBranchMembership(
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

    const duplicate = await this.assignments.existsActiveForTarget({
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

    await this.assignments.save(assignment);

    return {
      assignmentId: assignment.getId().getValue(),
    };
  }
}
