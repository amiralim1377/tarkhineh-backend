import { Query } from '@nestjs/cqrs';
import type { PermissionCode } from '../../../domain/permissions/permission-catalog.js';
import type { EffectiveAuthorizationContextInput } from '../../services/authorization-application.service.js';

export class GetEffectivePermissionsQuery extends Query<
  readonly PermissionCode[]
> {
  constructor(public readonly input: EffectiveAuthorizationContextInput) {
    super();
  }
}
