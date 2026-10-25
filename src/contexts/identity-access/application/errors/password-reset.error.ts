import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class PasswordResetInvalidError extends ApplicationError {
  readonly code = 'IDENTITY.PASSWORD_RESET_INVALID';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super('The password reset token is invalid or has expired.');
  }
}

export class PasswordRequiredError extends ApplicationError {
  readonly code = 'IDENTITY.PASSWORD_REQUIRED';
  readonly category = ERROR_CATEGORY.REQUEST_ERROR;

  constructor() {
    super('Password is required. Please enter a password.');
  }
}

export class PasswordPolicyViolationError extends ApplicationError {
  readonly code = 'IDENTITY.PASSWORD_POLICY_VIOLATION';
  readonly category = ERROR_CATEGORY.REQUEST_ERROR;

  constructor() {
    super(
      'Password must be 8 to 1024 characters long and contain at least one uppercase English letter (A-Z). Special characters such as @ and ! are optional.',
    );
  }
}
