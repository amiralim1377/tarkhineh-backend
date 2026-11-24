import { Inject } from '@nestjs/common';
import { CommandHandler } from '@nestjs/cqrs';
import type { ICommandHandler } from '@nestjs/cqrs';
import { AddBranchMemberCommand } from './add-branch-member.command.js';
import type { AddBranchMemberResult } from './add-branch-member.command.js';
import { UniqueId } from '../../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  ORGANIZATION_LOOKUP_PORT,
  type OrganizationLookupPort,
} from '../../ports/organization-lookup.port.js';
import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from '../../ports/branch.repository.js';
import {
  ORGANIZATION_STATUS,
  MEMBERSHIP_STATUS,
} from '../../../contracts/lifecycle-status.contract.js';

import {
  IDENTITY_ACCESS_USER_LOOKUP,
  type IdentityAccessUserLookup,
} from '../../../../identity-access/contracts/user-lookup.contract.js';
import { OrganizationMembership } from '../../../domain/entities/organization-membership.js';
import { BranchMembership } from '../../../domain/entities/branch-membership.js';
import { InvalidOrganizationMemberAdditionInputError } from '../../errors/invalid-organization-member-addition-input.error.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import { OrganizationMemberUserNotFoundError } from '../../errors/organization-member-user-not-found.error.js';
import { OrganizationMemberUserNotActiveError } from '../../errors/organization-member-user-not-active.error.js';
import { BranchNotFoundError } from '../../errors/branch-not-found.error.js';
import { BranchInactiveError } from '../../errors/branch-inactive.error.js';
import { BranchMembershipAlreadyExistsError } from '../../errors/branch-membership-already-exists.error.js';
import {
  BRANCH_MEMBER_ADDITION_UNIT_OF_WORK,
  type BranchMemberAdditionUnitOfWork,
} from '../../ports/branch-member-addition-unit-of-work.port.js';
import { OrganizationMembershipNotActiveError } from '../../errors/organization-membership-not-active.error.js';
import { BranchMemberAdditionForbiddenError } from '../../errors/branch-member-addition-forbidden.error.js';
import {
  BRANCH_MEMBER_ADDITION_AUTHORIZATION_PORT,
  type BranchMemberAdditionAuthorizationPort,
} from '../../ports/branch-member-addition-authorization.port.js';

@CommandHandler(AddBranchMemberCommand)
export class AddBranchMemberHandler implements ICommandHandler<
  AddBranchMemberCommand,
  AddBranchMemberResult
> {
  constructor(
    @Inject(ORGANIZATION_LOOKUP_PORT)
    private readonly organizationLookup: OrganizationLookupPort,
    @Inject(BRANCH_REPOSITORY)
    private readonly branchRepository: BranchRepository,
    @Inject(BRANCH_MEMBER_ADDITION_AUTHORIZATION_PORT)
    private readonly branchMemberAdditionAuthorization: BranchMemberAdditionAuthorizationPort,
    @Inject(IDENTITY_ACCESS_USER_LOOKUP)
    private readonly userLookup: IdentityAccessUserLookup,
    @Inject(BRANCH_MEMBER_ADDITION_UNIT_OF_WORK)
    private readonly unitOfWork: BranchMemberAdditionUnitOfWork,
  ) {}

  async execute(
    command: AddBranchMemberCommand,
  ): Promise<AddBranchMemberResult> {
    const actorUserId = command.actorUserId.trim();
    const organizationId = command.organizationId.trim();
    const branchId = command.branchId.trim();
    const memberUserId = command.memberUserId.trim();

    if (!actorUserId) {
      throw new InvalidOrganizationMemberAdditionInputError('actorUserId');
    }

    if (!organizationId) {
      throw new InvalidOrganizationMemberAdditionInputError('organizationId');
    }

    if (!branchId) {
      throw new InvalidOrganizationMemberAdditionInputError('branchId');
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
      await this.branchMemberAdditionAuthorization.canAddBranchMember({
        actorUserId,
        organizationId,
        branchId,
      });

    if (!isAuthorized) {
      throw new BranchMemberAdditionForbiddenError();
    }

    const userStatus = await this.userLookup.findStatusById(memberUserId);

    if (userStatus === null) {
      throw new OrganizationMemberUserNotFoundError();
    }

    if (userStatus !== 'ACTIVE') {
      throw new OrganizationMemberUserNotActiveError();
    }

    const branch = await this.branchRepository.findById(
      organizationId,
      branchId,
    );

    if (!branch) {
      throw new BranchNotFoundError(organizationId, branchId);
    }

    if (!branch.isActive()) {
      throw new BranchInactiveError();
    }

    // Generate identifiers before the transaction callback
    // so they remain stable if the transaction is retried.

    const newOrganizationMembership = OrganizationMembership.create({
      organizationId,
      userId: memberUserId,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });

    const branchMembershipId = new UniqueId().getValue();

    const branchMembershipIdResult = await this.unitOfWork.execute(
      async (context) => {
        // Find the user's base organization membership.
        const existingOrganizationMembership =
          await context.organizationMembershipRepository.findByOrganizationAndUser(
            organizationId,
            memberUserId,
          );

        let organizationMembership: OrganizationMembership;

        if (existingOrganizationMembership) {
          if (!existingOrganizationMembership.isActive()) {
            throw new OrganizationMembershipNotActiveError();
          }

          // Reuse the existing active organization membership.
          organizationMembership = existingOrganizationMembership;
        } else {
          // Create a base organization membership.
          organizationMembership = newOrganizationMembership;

          await context.organizationMembershipRepository.save(
            organizationMembership,
          );
        }

        // Check whether the user already belongs to this branch.
        const existingBranchMembership =
          await context.branchMembershipRepository.findByBranchAndOrganizationMembership(
            organizationId,
            branchId,
            organizationMembership.id,
          );

        if (existingBranchMembership) {
          throw new BranchMembershipAlreadyExistsError();
        }

        // Create an active branch membership.
        const branchMembership = BranchMembership.create({
          id: branchMembershipId,
          organizationId,
          branchId,
          organizationMembershipId: organizationMembership.id,
          status: MEMBERSHIP_STATUS.ACTIVE,
        });

        await context.branchMembershipRepository.save(branchMembership);

        return branchMembership.id;
      },
    );

    return {
      branchMembershipId: branchMembershipIdResult,
    };
  }
}
