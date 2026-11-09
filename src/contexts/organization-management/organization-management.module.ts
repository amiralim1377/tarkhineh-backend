import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../prisma/prisma.module.js';

import { CreateBranchHandler } from './application/commands/create-branch/create-branch.handler.js';
import { BRANCH_REPOSITORY } from './application/ports/branch.repository.js';
import { PrismaBranchRepository } from './infrastructure/persistence/prisma-branch.repository.js';
import { ORGANIZATION_LOOKUP_PORT } from './application/ports/organization-lookup.port.js';
import { PrismaOrganizationLookupAdapter } from './infrastructure/persistence/prisma-organization-lookup.adapter.js';
import { BRANCH_CREATION_AUTHORIZATION_PORT } from './application/ports/branch-creation-authorization.port.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { AccessControlBranchCreationAuthorizationAdapter } from './infrastructure/authorization/access-control-branch-creation.adapter.js';
import { OrganizationBranchesController } from './presentation/http/controllers/organization-branches.controller.js';

@Module({
  imports: [CqrsModule, PrismaModule, AccessControlModule],
  controllers: [OrganizationBranchesController],
  providers: [
    CreateBranchHandler,
    {
      provide: BRANCH_REPOSITORY,
      useClass: PrismaBranchRepository,
    },
    {
      provide: ORGANIZATION_LOOKUP_PORT,
      useClass: PrismaOrganizationLookupAdapter,
    },
    {
      provide: BRANCH_CREATION_AUTHORIZATION_PORT,
      useClass: AccessControlBranchCreationAuthorizationAdapter,
    },
  ],
})
export class OrganizationManagementModule {}
