import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SharedModule } from '../../shared/shared.module.js';
import { ACCESS_CONTROL_UNIT_OF_WORK } from './application/ports/access-control-unit-of-work.port.js';
import { AUTHORIZATION_SNAPSHOT_READER } from './application/ports/authorization-snapshot-reader.port.js';
import { AuthorizationApplicationService } from './application/services/authorization-application.service.js';
import { CreateRoleHandler } from './application/commands/create-role/create-role.handler.js';
import { UpdateRoleHandler } from './application/commands/update-role/update-role.handler.js';
import { ArchiveRoleHandler } from './application/commands/archive-role/archive-role.handler.js';
import { AssignRoleHandler } from './application/commands/assign-role/assign-role.handler.js';
import { RevokeRoleHandler } from './application/commands/revoke-role/revoke-role.handler.js';
import { SetPermissionOverrideHandler } from './application/commands/set-permission-override/set-permission-override.handler.js';
import { RemovePermissionOverrideHandler } from './application/commands/remove-permission-override/remove-permission-override.handler.js';
import { CheckPermissionHandler } from './application/queries/check-permission/check-permission.handler.js';
import { GetEffectivePermissionsHandler } from './application/queries/get-effective-permissions/get-effective-permissions.handler.js';
import { ListAvailablePermissionsHandler } from './application/queries/list-available-permissions/list-available-permissions.handler.js';
import { PrismaDefaultAuthorizationSnapshotReader } from './infrastructure/persistence/prisma-authorization-snapshot.reader.js';
import { PrismaAccessControlUnitOfWork } from './infrastructure/persistence/prisma-access-control.unit-of-work.js';
import { AccessControlPermissionsController } from './presentation/http/controllers/access-control-permissions.controller.js';
import { AccessControlRolesController } from './presentation/http/controllers/access-control-roles.controller.js';
import { RoleAssignmentsController } from './presentation/http/controllers/role-assignments.controller.js';
import { PermissionOverridesController } from './presentation/http/controllers/permission-overrides.controller.js';
import { ACCESS_CONTROL_AUTHORIZATION } from './contracts/authorization.contract.js';

@Module({
  imports: [CqrsModule, PrismaModule, SharedModule],
  controllers: [
    AccessControlPermissionsController,
    AccessControlRolesController,
    RoleAssignmentsController,
    PermissionOverridesController,
  ],
  providers: [
    // Application services
    AuthorizationApplicationService,
    // Command handlers
    CreateRoleHandler,
    UpdateRoleHandler,
    ArchiveRoleHandler,
    AssignRoleHandler,
    RevokeRoleHandler,
    SetPermissionOverrideHandler,
    RemovePermissionOverrideHandler,
    // Query handlers
    CheckPermissionHandler,
    GetEffectivePermissionsHandler,
    ListAvailablePermissionsHandler,
    // Infrastructure adapters
    PrismaDefaultAuthorizationSnapshotReader,
    PrismaAccessControlUnitOfWork,
    // Application ports
    {
      provide: AUTHORIZATION_SNAPSHOT_READER,
      useExisting: PrismaDefaultAuthorizationSnapshotReader,
    },
    {
      provide: ACCESS_CONTROL_UNIT_OF_WORK,
      useExisting: PrismaAccessControlUnitOfWork,
    },
    {
      provide: ACCESS_CONTROL_AUTHORIZATION,
      useExisting: AuthorizationApplicationService,
    },
  ],
  exports: [AuthorizationApplicationService, ACCESS_CONTROL_AUTHORIZATION],
})
export class AccessControlModule {}
