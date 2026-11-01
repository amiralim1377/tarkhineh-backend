import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ROLE_DEFINITION_SCOPE } from '../../../domain/roles/role.types.js';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleArchiveError } from '../../errors/invalid-role-archive.error.js';
import { RoleNotFoundError } from '../../errors/role-not-found.error.js';
import {
  ACCESS_CONTROL_UNIT_OF_WORK,
  type AccessControlUnitOfWork,
} from '../../ports/access-control-unit-of-work.port.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  ArchiveRoleCommand,
  type ArchiveRoleResult,
} from './archive-role.command.js';

@CommandHandler(ArchiveRoleCommand)
export class ArchiveRoleHandler
  implements ICommandHandler<ArchiveRoleCommand, ArchiveRoleResult>
{
  constructor(
    @Inject(ACCESS_CONTROL_UNIT_OF_WORK)
    private readonly unitOfWork: AccessControlUnitOfWork,
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(command: ArchiveRoleCommand): Promise<ArchiveRoleResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new AccessControlActorRequiredError();
    }

    const organizationId = command.input.organizationId.trim();
    const roleId = command.input.roleId.trim();

    if (!organizationId || !roleId) {
      throw new InvalidRoleArchiveError();
    }

    return this.unitOfWork.execute(async (context) => {
      // Check archive authority before looking up the Role.
      // This prevents unauthorized callers from probing tenant Role IDs.
      const authorizationContext =
        await this.authorization.getEffectiveAuthorizationContext(
          {
            userId: actorUserId,
            organizationId,
          },
          context.authorizationSnapshotReader,
        );

      const archivePermission = PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE;

      if (
        !authorizationContext.permissionCodes.includes(archivePermission)
      ) {
        throw new AccessControlForbiddenError(archivePermission);
      }

      // This lookup is tenant-scoped and transaction-bound.
      const role = await context.roleRepository.findById(
        organizationId,
        roleId,
      );

      if (
        !role ||
        role.getDefinitionScope() !== ROLE_DEFINITION_SCOPE.ORGANIZATION ||
        role.getOrganizationId() !== organizationId
      ) {
        throw new RoleNotFoundError(organizationId, roleId);
      }

      // Archiving is idempotent. Historical assignments remain untouched.
      if (!role.isEffectiveForAuthorization()) {
        return { roleId: role.getId().getValue() };
      }

      // Archiving only reduces access; it does not require permission
      // delegation for the permissions currently contained in the Role.
      role.archive();
      await context.roleRepository.update(role);

      return { roleId: role.getId().getValue() };
    });
  }
}
