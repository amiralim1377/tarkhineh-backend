import { Inject } from '@nestjs/common';
import { CommandHandler } from '@nestjs/cqrs';
import type { ICommandHandler } from '@nestjs/cqrs';
import { AddOrganizationMemberCommand } from './add-organization-member.command.js';
import type { AddOrganizationMemberResult } from './add-organization-member.command.js';
import {
  ORGANIZATION_LOOKUP_PORT,
  type OrganizationLookupPort,
} from '../../ports/organization-lookup.port.js';
import {
  ORGANIZATION_STATUS,
  MEMBERSHIP_STATUS,
} from '../../../contracts/lifecycle-status.contract.js';
import {
  ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT,
  type OrganizationMemberAdditionAuthorizationPort,
} from '../../ports/organization-member-addition-authorization.port.js';
import {
  IDENTITY_ACCESS_USER_LOOKUP,
  type IdentityAccessUserLookup,
} from '../../../../identity-access/contracts/user-lookup.contract.js';
import {
  ORGANIZATION_MEMBERSHIP_PORT,
  type OrganizationMembershipPort,
} from '../../ports/organization-membership.port.js';
import { OrganizationMembership } from '../../../domain/entities/organization-membership.js';
import { OrganizationMembershipAlreadyExistsError } from '../../errors/organization-membership-already-exists.error.js';
import { InvalidOrganizationMemberAdditionInputError } from '../../errors/invalid-organization-member-addition-input.error.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import { OrganizationMemberAdditionForbiddenError } from '../../errors/organization-member-addition-forbidden.error.js';
import { OrganizationMemberUserNotFoundError } from '../../errors/organization-member-user-not-found.error.js';
import { OrganizationMemberUserNotActiveError } from '../../errors/organization-member-user-not-active.error.js';

@CommandHandler(AddOrganizationMemberCommand)
export class AddOrganizationMemberHandler implements ICommandHandler<
  AddOrganizationMemberCommand,
  AddOrganizationMemberResult
> {
  constructor(
    @Inject(ORGANIZATION_MEMBERSHIP_PORT)
    private readonly membershipRepository: OrganizationMembershipPort,
    @Inject(ORGANIZATION_LOOKUP_PORT)
    private readonly organizationLookup: OrganizationLookupPort,
    @Inject(ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT)
    private readonly memberAdditionAuthorization: OrganizationMemberAdditionAuthorizationPort,
    @Inject(IDENTITY_ACCESS_USER_LOOKUP)
    private readonly userLookup: IdentityAccessUserLookup,
  ) {}

  async execute(
    command: AddOrganizationMemberCommand,
  ): Promise<AddOrganizationMemberResult> {
    const actorUserId = command.actorUserId.trim();
    const organizationId = command.organizationId.trim();
    const memberUserId = command.memberUserId.trim();

    if (!actorUserId) {
      throw new InvalidOrganizationMemberAdditionInputError('actorUserId');
    }

    if (!organizationId) {
      throw new InvalidOrganizationMemberAdditionInputError('organizationId');
    }

    if (!memberUserId) {
      throw new InvalidOrganizationMemberAdditionInputError('memberUserId');
    }

    const organizationStatus =
      await this.organizationLookup.findStatusById(organizationId);

    if (organizationStatus === null) {
      throw new OrganizationNotFoundError(organizationId);
    }

    if (organizationStatus !== ORGANIZATION_STATUS.ACTIVE) {
      throw new OrganizationSuspendedError(organizationId);
    }

    const isAuthorized =
      await this.memberAdditionAuthorization.canAddOrganizationMember({
        actorUserId,
        organizationId,
      });

    if (!isAuthorized) {
      throw new OrganizationMemberAdditionForbiddenError();
    }

    const userStatus = await this.userLookup.findStatusById(memberUserId);

    if (userStatus === null) {
      throw new OrganizationMemberUserNotFoundError();
    }

    if (userStatus !== 'ACTIVE') {
      throw new OrganizationMemberUserNotActiveError();
    }

    const existingMembership =
      await this.membershipRepository.findByOrganizationAndUser(
        organizationId,
        memberUserId,
      );

    if (existingMembership) {
      throw new OrganizationMembershipAlreadyExistsError();
    }

    const membership = OrganizationMembership.create({
      organizationId,
      userId: memberUserId,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });

    await this.membershipRepository.save(membership);

    return {
      organizationMembershipId: membership.id,
    };
  }
}
