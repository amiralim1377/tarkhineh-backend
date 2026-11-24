import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class OrganizationMembershipAlreadyExistsError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ALREADY_EXISTS;

  constructor() {
    super('The user already has a membership in this organization.');
  }
}
