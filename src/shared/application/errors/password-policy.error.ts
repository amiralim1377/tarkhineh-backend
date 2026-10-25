import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { ApplicationError } from './application-error.js';

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
