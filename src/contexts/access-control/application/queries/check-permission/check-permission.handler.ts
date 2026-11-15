import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { CheckPermissionQuery } from './check-permission.query.js';

@QueryHandler(CheckPermissionQuery)
export class CheckPermissionHandler implements IQueryHandler<CheckPermissionQuery> {
  constructor(
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  execute(query: CheckPermissionQuery) {
    return this.authorization.checkPermission(query.input);
  }
}
