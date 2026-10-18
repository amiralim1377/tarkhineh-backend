import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';

export class InvalidEmailVerificationTokenError extends ApplicationError {
  readonly code = 'IDENTITY.EMAIL_VERIFICATION_TOKEN_INVALID';
  readonly category = ERROR_CATEGORY.REQUEST_ERROR;

  constructor() {
    super('Email verification token is invalid or expired');
  }
}
