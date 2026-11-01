import { Command } from '@nestjs/cqrs';

export interface AssignRoleCommandInput {
  readonly organizationId: string;
  readonly roleId: string;

  /** Exactly one target shape must be supplied. */
  readonly organizationMembershipId?: string;

  /** Both Branch fields are required for a Branch-assignment Role. */
  readonly branchMembershipId?: string;
  readonly branchId?: string;
}

export interface AssignRoleResult {
  readonly assignmentId: string;
}

export class AssignRoleCommand extends Command<AssignRoleResult> {
  /** actorUserId must come from trusted authentication context, never the request body. */
  constructor(
    public readonly actorUserId: string,
    public readonly input: AssignRoleCommandInput,
  ) {
    super();
  }
}
