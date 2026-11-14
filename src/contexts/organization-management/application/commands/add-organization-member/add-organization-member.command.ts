import { Command } from '@nestjs/cqrs';

export interface AddOrganizationMemberResult {
  readonly organizationMembershipId: string;
}

export class AddOrganizationMemberCommand extends Command<AddOrganizationMemberResult> {
  constructor(
    public readonly actorUserId: string,
    public readonly organizationId: string,
    public readonly memberUserId: string,
  ) {
    super();
  }
}
