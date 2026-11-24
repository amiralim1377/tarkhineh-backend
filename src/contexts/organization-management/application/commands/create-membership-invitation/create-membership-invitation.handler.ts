import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MembershipInvitation } from '../../../domain/entities/membership-invitation.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../../domain/types/membership-invitation-scope.js';
import {
  ORGANIZATION_STATUS,
  BRANCH_STATUS,
} from '../../../domain/types/lifecycle-status.js';
import { BranchInactiveError } from '../../errors/branch-inactive.error.js';
import { BranchNotFoundError } from '../../errors/branch-not-found.error.js';
import { MembershipInvitationAlreadyExistsError } from '../../errors/membership-invitation-already-exists.error.js';
import { MembershipInvitationCreationForbiddenError } from '../../errors/membership-invitation-creation-forbidden.error.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import {
  ORGANIZATION_LOOKUP_PORT,
  type OrganizationLookupPort,
} from '../../ports/organization-lookup.port.js';
import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from '../../ports/branch.repository.js';
import {
  MEMBERSHIP_INVITATION_AUTHORIZATION_PORT,
  type MembershipInvitationAuthorizationPort,
} from '../../ports/membership-invitation-authorization.port.js';
import {
  ORGANIZATION_MANAGEMENT_UNIT_OF_WORK,
  type OrganizationManagementUnitOfWork,
} from '../../ports/organization-management-unit-of-work.port.js';
import {
  CreateMembershipInvitationCommand,
  type CreateMembershipInvitationResult,
} from './create-membership-invitation.command.js';
import {
  SECURE_TOKEN_FACTORY,
  type SecureTokenFactory,
} from '../../../../../shared/application/ports/secure-token-factory.port.js';

// Invitation expiration policy: seven days.
const MEMBERSHIP_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Tarkhineh has a single organization.
const ORGANIZATION_DISPLAY_NAME = 'ترخینه';

@CommandHandler(CreateMembershipInvitationCommand)
@Injectable()
export class CreateMembershipInvitationCommandHandler implements ICommandHandler<CreateMembershipInvitationCommand> {
  constructor(
    @Inject(MEMBERSHIP_INVITATION_AUTHORIZATION_PORT)
    private readonly authorization: MembershipInvitationAuthorizationPort,
    @Inject(ORGANIZATION_LOOKUP_PORT)
    private readonly organizationLookup: OrganizationLookupPort,
    @Inject(BRANCH_REPOSITORY)
    private readonly branchRepository: BranchRepository,
    @Inject(ORGANIZATION_MANAGEMENT_UNIT_OF_WORK)
    private readonly unitOfWork: OrganizationManagementUnitOfWork,
    @Inject(SECURE_TOKEN_FACTORY)
    private readonly secureTokenFactory: SecureTokenFactory,
  ) {}

  async execute(
    command: CreateMembershipInvitationCommand,
  ): Promise<CreateMembershipInvitationResult> {
    const actorUserId = command.actorUserId.trim();
    const organizationId = command.organizationId.trim();

    const { input } = command;
    const email = input.email.trim().toLowerCase();

    let isAuthorized: boolean;

    if (input.scope === MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION) {
      isAuthorized = await this.authorization.canCreateMembershipInvitation({
        actorUserId,
        organizationId,
        scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
      });
    } else {
      isAuthorized = await this.authorization.canCreateMembershipInvitation({
        actorUserId,
        organizationId,
        scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
        branchId: input.branchId.trim(),
      });
    }

    if (!isAuthorized) {
      throw new MembershipInvitationCreationForbiddenError();
    }

    const organizationStatus =
      await this.organizationLookup.findStatusById(organizationId);

    if (!organizationStatus) {
      throw new OrganizationNotFoundError(organizationId);
    }

    if (organizationStatus !== ORGANIZATION_STATUS.ACTIVE) {
      throw new OrganizationSuspendedError(organizationId);
    }

    let branchName: string | undefined;

    if (input.scope === MEMBERSHIP_INVITATION_SCOPE.BRANCH) {
      const branch = await this.branchRepository.findById(
        organizationId,
        input.branchId.trim(),
      );

      if (!branch) {
        throw new BranchNotFoundError(organizationId, input.branchId.trim());
      }

      if (branch.status !== BRANCH_STATUS.ACTIVE) {
        throw new BranchInactiveError();
      }

      branchName = branch.nameFa;
    }

    const { rawToken, tokenHash } = this.secureTokenFactory.create({
      byteLength: 32,
    });

    const expiresAt = new Date(Date.now() + MEMBERSHIP_INVITATION_TTL_MS);

    const invitation = MembershipInvitation.create({
      organizationId,
      email,
      inviterUserId: actorUserId,
      tokenHash,
      scope: input.scope,
      expiresAt,
      ...(input.scope === MEMBERSHIP_INVITATION_SCOPE.BRANCH
        ? { branchId: input.branchId.trim() }
        : {}),
    });

    //  ATOMIC PERSISTENCE
    await this.unitOfWork.execute(async (context) => {
      let existingInvitation: MembershipInvitation | null;

      if (input.scope === MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION) {
        existingInvitation =
          await context.membershipInvitationRepository.findPendingByOrganizationAndEmail(
            organizationId,
            email,
          );
      } else {
        existingInvitation =
          await context.membershipInvitationRepository.findPendingByBranchAndEmail(
            organizationId,
            input.branchId.trim(),
            email,
          );
      }

      if (existingInvitation) {
        // Replace an expired pending invitation.
        const expired = existingInvitation.expire();

        if (!expired) {
          throw new MembershipInvitationAlreadyExistsError();
        }

        await context.membershipInvitationRepository.update(existingInvitation);
      }

      await context.membershipInvitationRepository.save(invitation);

      await context.membershipInvitationEmail.enqueueInvitationEmail({
        invitationId: invitation.id,
        email,
        rawToken,
        scope: input.scope,
        organizationName: ORGANIZATION_DISPLAY_NAME,
        ...(branchName ? { branchName } : {}),
        expiresAt,
      });
    });

    return {
      membershipInvitationId: invitation.id,
    };
  }
}
