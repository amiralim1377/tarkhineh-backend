import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PermissionDelegationPolicy } from '../../../domain/authorization/permission-delegation.policy.js';
import { ROLE_DEFINITION_SOURCE } from '../../../domain/roles/role.types.js';
import { Role } from '../../../domain/roles/role.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { RoleCodeAlreadyExistsError } from '../../errors/role-code-already-exists.error.js';
import {
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
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
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(command: CreateRoleCommand): Promise<CreateRoleResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();

    // Validate the aggregate before opening a transaction.
    const role = Role.create({
      code: command.input.code,
      name: command.input.name,
      description: command.input.description,
      definitionSource: ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
      assignmentScope: command.input.assignmentScope,
      organizationId,
      isAssignable: true,
      permissionCodes: command.input.permissionCodes,
    });

    return this.unitOfWork.execute(async (context) => {
      // Authorization reads must use the same transaction as persistence.
      const actorEffectivePermissionCodes =
        await this.authorization.getEffectiveDelegationPermissionCodes(
          {
            userId: actorUserId,
            organizationId,
            assignmentScope: role.getAssignmentScope(),
          },
          context.authorizationSnapshotReader,
        );

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
      const codeExists = await context.roleRepository.existsByCode(
        organizationId,
        role.getCode(),
      );

      if (codeExists) {
        throw new RoleCodeAlreadyExistsError();
      }

      // Role and its complete Permission relation set are persisted atomically.
      await context.roleRepository.save(role, actorUserId);

      return {
        roleId: role.getId().getValue(),
      };
    });
  }
}
