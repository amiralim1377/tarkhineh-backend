import { Command } from '@nestjs/cqrs';

export interface RemovePermissionOverrideCommandInput {
  readonly organizationId: string;
  readonly organizationMembershipId: string;
  readonly branchId: string;
  readonly permissionCode: string;
}

export interface RemovePermissionOverrideResult {
  readonly overrideId: string | null;
  readonly removed: boolean;
}

export class RemovePermissionOverrideCommand extends Command<RemovePermissionOverrideResult> {
  /** actorUserId must come from trusted authentication context, never the request body. */
  constructor(
    public readonly actorUserId: string,
    public readonly input: RemovePermissionOverrideCommandInput,
  ) {
    super();
  }
}
