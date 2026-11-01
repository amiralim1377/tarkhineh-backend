import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ACCESS_CONTROL_APPLICATION_ERROR_CODE } from './access-control-application-error-code.js';

export class PermissionOverrideTargetNotFoundError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.NOT_FOUND;
  override readonly code =
    ACCESS_CONTROL_APPLICATION_ERROR_CODE.PERMISSION_OVERRIDE_TARGET_NOT_FOUND;

  constructor() {
    super('The active OrganizationMembership and Branch target was not found.');
  }
}
