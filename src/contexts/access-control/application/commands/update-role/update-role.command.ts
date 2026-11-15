import { Command } from '@nestjs/cqrs';

export interface UpdateRoleCommandInput {
  readonly organizationId: string;
  readonly roleId: string;
  readonly name?: string;
  readonly description?: string | null;
  /** When supplied, this replaces the complete Permission set. An empty array clears it. */
  readonly permissionCodes?: readonly string[];
}

export interface UpdateRoleResult {
  readonly roleId: string;
}

export class UpdateRoleCommand extends Command<UpdateRoleResult> {
  /** actorUserId must come from the trusted authenticated application context. */
  constructor(
    public readonly actorUserId: string,
    public readonly input: UpdateRoleCommandInput,
  ) {
    super();
  }
}
