import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class InvalidOrganizationMemberAdditionInputError extends ApplicationError {
  override readonly category = ERROR_CATEGORY.VALIDATION;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.ORGANIZATION_MEMBER_ADDITION_INVALID_INPUT;

  constructor(field: string) {
    super(`The field "${field}" is required to add an organization member.`);
  }
}
