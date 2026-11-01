import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class InvalidRoleAssignmentRevocationError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.VALIDATION;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.ROLE_ASSIGNMENT_REVOCATION_INVALID;

  constructor() {
    super('The Role assignment cannot be revoked with the supplied time.');
  }
}
