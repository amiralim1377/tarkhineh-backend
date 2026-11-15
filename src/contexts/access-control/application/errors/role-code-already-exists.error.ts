import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class RoleCodeAlreadyExistsError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.ROLE_CODE_ALREADY_EXISTS;

  constructor() {
    super('A Role with this code already exists in the Organization.');
  }
}
