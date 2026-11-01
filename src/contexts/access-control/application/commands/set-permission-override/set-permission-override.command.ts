import { Command } from '@nestjs/cqrs';
import type { PermissionOverrideEffect } from '../../../domain/permission-overrides/permission-override.js';

export interface SetPermissionOverrideCommandInput {
  readonly organizationId: string;
  readonly organizationMembershipId: string;
  readonly branchId: string;
  readonly permissionCode: string;
  readonly effect: PermissionOverrideEffect;
}

export interface SetPermissionOverrideResult {
  readonly overrideId: string;
  readonly changed: boolean;
}

export class SetPermissionOverrideCommand extends Command<SetPermissionOverrideResult> {
  /** actorUserId must come from trusted authentication context, never the request body. */
  constructor(
    public readonly actorUserId: string,
    public readonly input: SetPermissionOverrideCommandInput,
  ) {
    super();
  }
}
