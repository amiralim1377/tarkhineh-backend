import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class OrganizationSuspendedError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;
  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.ORGANIZATION_SUSPENDED;

  constructor(organizationId: string) {
    super(`Organization "${organizationId}" is suspended.`);
  }
}
