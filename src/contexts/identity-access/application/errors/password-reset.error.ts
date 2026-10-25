import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class PasswordResetInvalidError extends ApplicationError {
  readonly code = 'IDENTITY.PASSWORD_RESET_INVALID';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super('The password reset token is invalid or has expired.');
  }
}

export class PasswordResetPasswordInvalidError extends ApplicationError {
  readonly code = 'IDENTITY.PASSWORD_RESET_PASSWORD_INVALID';
  readonly category = ERROR_CATEGORY.REQUEST_ERROR;

  constructor() {
    super('The new password is invalid.');
  }
}
