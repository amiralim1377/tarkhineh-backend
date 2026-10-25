import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class PasswordResetInvalidError extends ApplicationError {
  readonly code = 'IDENTITY.PASSWORD_RESET_INVALID';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super(
      'This password reset link is invalid, has expired, or has already been used. Please request a new password reset link and try again.',
    );
  }
}
