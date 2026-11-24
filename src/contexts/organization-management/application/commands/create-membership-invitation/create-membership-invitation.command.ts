import { Command } from '@nestjs/cqrs';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../../domain/types/membership-invitation-scope.js';

export type CreateMembershipInvitationCommandInput =
  | {
      readonly email: string;
      readonly scope: typeof MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION;
      readonly branchId?: never;
    }
  | {
      readonly email: string;
      readonly scope: typeof MEMBERSHIP_INVITATION_SCOPE.BRANCH;
      readonly branchId: string;
    };

export interface CreateMembershipInvitationResult {
  readonly membershipInvitationId: string;
}

export class CreateMembershipInvitationCommand extends Command<CreateMembershipInvitationResult> {
  constructor(
    public readonly actorUserId: string,
    public readonly organizationId: string,
    public readonly input: CreateMembershipInvitationCommandInput,
  ) {
    super();
  }
}
