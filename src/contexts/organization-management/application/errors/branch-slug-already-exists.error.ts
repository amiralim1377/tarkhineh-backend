import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class BranchSlugAlreadyExistsError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.BRANCH_SLUG_ALREADY_EXISTS;

  constructor(organizationId: string, slug: string) {
    super(
      `Branch slug "${slug}" already exists in organization "${organizationId}".`,
    );
  }
}
