import { Command } from '@nestjs/cqrs';

export interface AddBranchMemberResult {
  readonly branchMembershipId: string;
}

export class AddBranchMemberCommand extends Command<AddBranchMemberResult> {
  constructor(
    public readonly actorUserId: string,
    public readonly organizationId: string,
    public readonly branchId: string,
    public readonly memberUserId: string,
  ) {
    super();
  }
}
