import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PermissionDelegationPolicy } from '../../../domain/authorization/permission-delegation.policy.js';
import { ROLE_DEFINITION_SCOPE } from '../../../domain/roles/role.types.js';
import { Role } from '../../../domain/roles/role.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  ROLE_REPOSITORY,
  type RoleRepository,
} from '../../ports/role.repository.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { RoleCodeAlreadyExistsError } from '../../errors/role-code-already-exists.error.js';
import {
  CreateRoleCommand,
  type CreateRoleResult,
} from './create-role.command.js';

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<
  CreateRoleCommand,
  CreateRoleResult
> {
  private readonly delegationPolicy = new PermissionDelegationPolicy();

  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(command: CreateRoleCommand): Promise<CreateRoleResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();

    // Domain validation happens before authorization reads or persistence.
    const role = Role.create({
      code: command.input.code,
      name: command.input.name,
      description: command.input.description,
      definitionScope: ROLE_DEFINITION_SCOPE.ORGANIZATION,
      assignmentScope: command.input.assignmentScope,
      organizationId,
      isAssignable: true,
      permissionCodes: command.input.permissionCodes,
    });

    // This set is computed from one consistent Organization/Branch snapshot.
    // Branch permissions are included only when effective across every active
    // Branch, because an Organization-defined Role can later be assigned there.
    const actorEffectivePermissionCodes =
      await this.authorization.getEffectiveDelegationPermissionCodes({
        userId: actorUserId,
        organizationId,
        assignmentScope: role.getAssignmentScope(),
      });

    const delegationDecision = this.delegationPolicy.canComposeRole({
      role,
      organizationId,
      operation: 'CREATE',
      actorEffectivePermissionCodes,
    });

    if (!delegationDecision.allowed) {
      throw new AccessControlForbiddenError(delegationDecision.reasonCode);
    }

    // Do not disclose Role-code existence to an unauthorized actor.
    const codeExists = await this.roles.existsByCode(
      organizationId,
      role.getCode(),
    );

    if (codeExists) {
      throw new RoleCodeAlreadyExistsError();
    }

    // The Port contract requires Role + RolePermission persistence to be atomic.
    await this.roles.save(role);

    return {
      roleId: role.getId().getValue(),
    };
  }
}
