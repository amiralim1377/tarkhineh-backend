import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class OrganizationMemberUserNotActiveError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.ORGANIZATION_MEMBER_USER_NOT_ACTIVE;

  constructor() {
    super('The user account must be active before joining the organization.');
  }
}
