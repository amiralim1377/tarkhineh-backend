import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class BranchUpdateForbiddenError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.AUTHORIZATION;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.BRANCH_UPDATE_FORBIDDEN;

  constructor() {
    super('You are not allowed to update this branch.');
  }
}
