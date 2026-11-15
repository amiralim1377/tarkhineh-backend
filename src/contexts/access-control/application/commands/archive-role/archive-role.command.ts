import { Command } from '@nestjs/cqrs';

export interface ArchiveRoleCommandInput {
  readonly organizationId: string;
  readonly roleId: string;
}

export interface ArchiveRoleResult {
  readonly roleId: string;
}

export class ArchiveRoleCommand extends Command<ArchiveRoleResult> {
  /** actorUserId must come from the trusted authenticated application context. */
  constructor(
    public readonly actorUserId: string,
    public readonly input: ArchiveRoleCommandInput,
  ) {
    super();
  }
}
