import { Query } from '@nestjs/cqrs';
import type { PermissionDefinition } from '../../../domain/permissions/permission-catalog.js';
import type { RoleAssignmentScope } from '../../../domain/roles/role.types.js';

export interface ListAvailablePermissionsQueryInput {
  /** Must come from trusted authentication context. */
  readonly userId: string;
  readonly organizationId: string;
  readonly assignmentScope: RoleAssignmentScope;
}

export class ListAvailablePermissionsQuery extends Query<
  readonly PermissionDefinition[]
> {
  constructor(public readonly input: ListAvailablePermissionsQueryInput) {
    super();
  }
}
