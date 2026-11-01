import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class RoleAssignmentNotFoundError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.NOT_FOUND;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.ROLE_ASSIGNMENT_NOT_FOUND;

  constructor() {
    super('The Role assignment was not found for the supplied target context.');
  }
}
