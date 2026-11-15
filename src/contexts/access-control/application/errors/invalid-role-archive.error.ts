import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class InvalidRoleArchiveError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.VALIDATION;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.ROLE_ARCHIVE_INVALID;

  constructor() {
    super(
      'A Role archive operation requires valid Organization and Role identifiers.',
    );
  }
}
