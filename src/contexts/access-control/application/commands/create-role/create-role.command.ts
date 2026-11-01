import { Command } from '@nestjs/cqrs';
import type { RoleAssignmentScope } from '../../../domain/roles/role.types.js';

export interface CreateRoleCommandInput {
  readonly organizationId: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly assignmentScope: RoleAssignmentScope;
  readonly permissionCodes: readonly string[];
}

export interface CreateRoleResult {
  readonly roleId: string;
}

export class CreateRoleCommand extends Command<CreateRoleResult> {
  /**
   * actorUserId must come from the trusted authenticated application context,
   * never from an untrusted HTTP request body.
   */
  constructor(
    public readonly actorUserId: string,
    public readonly input: CreateRoleCommandInput,
  ) {
    super();
  }
}
