import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class BranchCreationForbiddenError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.AUTHORIZATION;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.BRANCH_CREATION_FORBIDDEN;

  constructor() {
    super('You are not allowed to create a branch in this organization.');
  }
}
