import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class AccessControlActorRequiredError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.AUTHENTICATION;
  override readonly code = ACCESS_CONTROL_APPLICATION_ERROR_CODE.ACTOR_REQUIRED;

  constructor() {
    super('An authenticated actor is required for this operation.');
  }
}
