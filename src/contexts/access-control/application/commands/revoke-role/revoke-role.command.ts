import { Command } from '@nestjs/cqrs';

export interface RevokeRoleCommandInput {
  readonly organizationId: string;
  readonly assignmentId: string;

  /**
   * Omit for an OrganizationMembership assignment.
   * Supply the exact Branch ID for a BranchMembership assignment.
   */
  readonly branchId?: string;
}

export interface RevokeRoleResult {
  readonly assignmentId: string;
}

export class RevokeRoleCommand extends Command<RevokeRoleResult> {
  /** actorUserId must come from trusted authentication context, never the request body. */
  constructor(
    public readonly actorUserId: string,
    public readonly input: RevokeRoleCommandInput,
  ) {
    super();
  }
}
