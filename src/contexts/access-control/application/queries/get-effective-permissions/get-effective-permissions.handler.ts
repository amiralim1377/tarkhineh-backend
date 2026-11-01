import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { GetEffectivePermissionsQuery } from './get-effective-permissions.query.js';

@QueryHandler(GetEffectivePermissionsQuery)
export class GetEffectivePermissionsHandler implements IQueryHandler<GetEffectivePermissionsQuery> {
  constructor(
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  async execute(query: GetEffectivePermissionsQuery) {
    const context = await this.authorization.getEffectiveAuthorizationContext(
      query.input,
    );

    return context.permissionCodes;
  }
}
