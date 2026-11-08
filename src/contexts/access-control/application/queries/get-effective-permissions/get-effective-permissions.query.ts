import { Query } from '@nestjs/cqrs';
import type { PermissionCode } from '../../../domain/permissions/permission-catalog.js';
import type { AuthorizationContextInput } from '../../../domain/authorization/authorization.types.js';

export class GetEffectivePermissionsQuery extends Query<
  readonly PermissionCode[]
> {
  constructor(public readonly input: AuthorizationContextInput) {
    super();
  }
}
