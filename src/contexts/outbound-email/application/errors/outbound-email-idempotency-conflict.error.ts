import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { OUTBOUND_EMAIL_APPLICATION_ERROR_CODE } from './outbound-email-application-error-code.js';

export class OutboundEmailIdempotencyConflictError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.CONFLICT;

  override readonly code =
    OUTBOUND_EMAIL_APPLICATION_ERROR_CODE.IDEMPOTENCY_CONFLICT;

  constructor() {
    super(
      'The outbound email idempotency key was already used for a different or unverifiable request.',
    );
  }
}
