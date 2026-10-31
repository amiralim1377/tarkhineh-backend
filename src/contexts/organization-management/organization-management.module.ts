import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateBranchHandler } from './application/commands/create-branch/create-branch.handler.js';
import { BRANCH_REPOSITORY } from './application/ports/branch.repository.js';
import { PrismaBranchRepository } from './infrastructure/persistence/prisma-branch.repository.js';
import { ORGANIZATION_LOOKUP_PORT } from './application/ports/organization-lookup.port.js';
import { PrismaOrganizationLookupAdapter } from './infrastructure/persistence/prisma-organization-lookup.adapter.js';
import { BRANCH_CREATION_AUTHORIZATION_PORT } from './application/ports/branch-creation-authorization.port.js';

@Module({
  imports: [CqrsModule],
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
      useValue: {
        canCreateBranch: async () => false,
      },
    },
  ],
})
export class OrganizationManagementModule {}
