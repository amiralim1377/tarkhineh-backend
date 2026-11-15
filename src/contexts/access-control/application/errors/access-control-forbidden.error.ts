import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class AccessControlForbiddenError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.AUTHORIZATION;
  override readonly code = ACCESS_CONTROL_APPLICATION_ERROR_CODE.FORBIDDEN;

  constructor(reasonCode?: string) {
    super(
      'The actor is not authorized to perform this Access Control operation.',
      {
        metadata: reasonCode === undefined ? undefined : { reasonCode },
      },
    );
  }
}
