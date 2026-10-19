import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class ChangePasswordCredentialsError extends ApplicationError {
  readonly code = 'IDENTITY.CHANGE_PASSWORD_CREDENTIALS_INVALID';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super('The current password is invalid or password change is unavailable.');
  }
}

export class PasswordUnchangedError extends ApplicationError {
  readonly code = 'IDENTITY.NEW_PASSWORD_UNCHANGED';
  readonly category = ERROR_CATEGORY.REQUEST_ERROR;

  constructor() {
    super('The new password must differ from the current password.');
  }
}
