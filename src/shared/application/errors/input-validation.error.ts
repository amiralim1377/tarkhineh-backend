import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { ApplicationError } from './application-error.js';

export class InvalidCredentialsError extends ApplicationError {
  readonly code = 'IDENTITY.INVALID_CREDENTIALS';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super('Invalid email or password');
  }
}
