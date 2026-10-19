import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class InvalidRefreshTokenError extends ApplicationError {
  readonly code = 'IDENTITY.INVALID_REFRESH_TOKEN';
  readonly category = ERROR_CATEGORY.AUTHENTICATION;

  constructor() {
    super('Refresh token is invalid or expired');
  }
}
