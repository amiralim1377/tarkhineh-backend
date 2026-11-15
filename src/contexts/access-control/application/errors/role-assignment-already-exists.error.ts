import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class RoleAssignmentAlreadyExistsError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.ROLE_ASSIGNMENT_ALREADY_EXISTS;

  constructor() {
    super('This Role is already actively assigned to the membership.');
  }
}
