import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class InvalidCredentialsError extends ApplicationError {
  readonly code = 'IDENTITY.INVALID_CREDENTIALS';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super('Invalid email or password');
  }
}
