import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ROLE_DEFINITION_SCOPE } from '../../../domain/roles/role.types.js';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleArchiveError } from '../../errors/invalid-role-archive.error.js';
import { RoleNotFoundError } from '../../errors/role-not-found.error.js';
import {
  ROLE_REPOSITORY,
  type RoleRepository,
} from '../../ports/role.repository.js';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import {
  ArchiveRoleCommand,
  type ArchiveRoleResult,
} from './archive-role.command.js';

@CommandHandler(ArchiveRoleCommand)
export class ArchiveRoleHandler implements ICommandHandler<
  ArchiveRoleCommand,
  ArchiveRoleResult
> {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
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

    // Check archive authority before looking up the Role, so an unauthorized
    // actor cannot use this operation to probe tenant Role identifiers.
    const authorizationContext =
      await this.authorization.getEffectiveAuthorizationContext({
        userId: actorUserId,
        organizationId,
      });

    const archivePermission = PERMISSION_CODE.ORGANIZATION_ROLES_ARCHIVE;

    if (!authorizationContext.permissionCodes.includes(archivePermission)) {
      throw new AccessControlForbiddenError(archivePermission);
    }

    // This lookup must be tenant-scoped by the Infrastructure adapter.
    const role = await this.roles.findById(organizationId, roleId);

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

    // Archiving only reduces access. It does not require permission
    // delegation for the permissions currently contained in the Role.
    role.archive();
    await this.roles.update(role);

    return { roleId: role.getId().getValue() };
  }
}
