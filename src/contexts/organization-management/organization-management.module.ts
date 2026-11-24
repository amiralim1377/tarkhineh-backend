import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CreateBranchHandler } from './application/commands/create-branch/create-branch.handler.js';
import { AddOrganizationMemberHandler } from './application/commands/add-organization-member/add-organization-member.handler.js';
import { CreateMembershipInvitationCommandHandler } from './application/commands/create-membership-invitation/create-membership-invitation.handler.js';
import { BRANCH_REPOSITORY } from './application/ports/branch.repository.js';
import { ORGANIZATION_LOOKUP_PORT } from './application/ports/organization-lookup.port.js';
import { BRANCH_CREATION_AUTHORIZATION_PORT } from './application/ports/branch-creation-authorization.port.js';
import { ORGANIZATION_MEMBERSHIP_PORT } from './application/ports/organization-membership.port.js';
import { ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT } from './application/ports/organization-member-addition-authorization.port.js';
import { ORGANIZATION_MANAGEMENT_UNIT_OF_WORK } from './application/ports/organization-management-unit-of-work.port.js';
import { PrismaBranchRepository } from './infrastructure/persistence/prisma-branch.repository.js';
import { PrismaOrganizationLookupAdapter } from './infrastructure/persistence/prisma-organization-lookup.adapter.js';
import { PrismaOrganizationMembershipRepository } from './infrastructure/persistence/prisma-organization-membership.repository.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { IdentityAccessModule } from '../identity-access/identity-access.module.js';
import { SharedModule } from '../../shared/shared.module.js';
import { AccessControlBranchCreationAuthorizationAdapter } from './infrastructure/authorization/access-control-branch-creation.adapter.js';
import { AccessControlOrganizationMemberAdditionAuthorizationAdapter } from './infrastructure/authorization/access-control-organization-member-addition.adapter.js';
import { OrganizationBranchesController } from './presentation/http/controllers/organization-branches.controller.js';
import { OrganizationMembersController } from './presentation/http/controllers/organization-members.controller.js';
import { OutboundEmailModule } from '../outbound-email/outbound-email.module.js';
import { PrismaOrganizationManagementUnitOfWork } from './infrastructure/persistence/prisma-organization-management.unit-of-work.js';
import { MEMBERSHIP_INVITATION_AUTHORIZATION_PORT } from './application/ports/membership-invitation-authorization.port.js';
import { AccessControlMembershipInvitationAuthorizationAdapter } from './infrastructure/authorization/access-control-membership-invitation-authorization.adapter.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Module({
  imports: [
    CqrsModule,
    PrismaModule,
    AccessControlModule,
    IdentityAccessModule,
    SharedModule,
    OutboundEmailModule,
  ],
  controllers: [OrganizationBranchesController, OrganizationMembersController],
  providers: [
    CreateBranchHandler,
    AddOrganizationMemberHandler,
    CreateMembershipInvitationCommandHandler,
    PrismaOrganizationManagementUnitOfWork,
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
    {
      provide: ORGANIZATION_MEMBERSHIP_PORT,
      useFactory: (prisma: PrismaService) =>
        new PrismaOrganizationMembershipRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT,
      useClass: AccessControlOrganizationMemberAdditionAuthorizationAdapter,
    },
    {
      provide: ORGANIZATION_MANAGEMENT_UNIT_OF_WORK,
      useExisting: PrismaOrganizationManagementUnitOfWork,
    },
    {
      provide: MEMBERSHIP_INVITATION_AUTHORIZATION_PORT,
      useClass: AccessControlMembershipInvitationAuthorizationAdapter,
    },
  ],
})
export class OrganizationManagementModule {}
