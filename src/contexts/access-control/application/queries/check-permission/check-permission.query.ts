import { Query } from '@nestjs/cqrs';
import type { AuthorizationDecision } from '../../../domain/authorization/authorization-decision.js';
import type { CheckPermissionInput } from '../../../domain/authorization/authorization.types.js';

export class CheckPermissionQuery extends Query<AuthorizationDecision> {
  constructor(public readonly input: CheckPermissionInput) {
    super();
  }
}
