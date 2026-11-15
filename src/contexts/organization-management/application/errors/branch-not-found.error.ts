import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class BranchNotFoundError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.NOT_FOUND;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.BRANCH_NOT_FOUND;

  constructor(organizationId: string, branchId: string) {
    super(
      `Branch "${branchId}" was not found in organization "${organizationId}".`,
    );
  }
}
