import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class InvalidPermissionOverrideRequestError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.VALIDATION;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.PERMISSION_OVERRIDE_REQUEST_INVALID;

  constructor() {
    super(
      'A Permission override requires valid Organization, membership, Branch, and Permission identifiers.',
    );
  }
}
