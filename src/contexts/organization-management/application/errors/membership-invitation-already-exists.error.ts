import { ApplicationError } from '../../../../shared/application/errors/application-error.js';
import {
  ERROR_CATEGORY,
  ErrorCategory,
} from '../../../../shared/errors/error-category.js';
import { ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE } from './organization-management-application-error-code.js';

export class MembershipInvitationAlreadyExistsError extends ApplicationError {
  override readonly category: ErrorCategory = ERROR_CATEGORY.CONFLICT;

  override readonly code =
    ORGANIZATION_MANAGEMENT_APPLICATION_ERROR_CODE.MEMBERSHIP_INVITATION_ALREADY_EXISTS;

  constructor() {
    super(
      'A pending membership invitation already exists for this email and destination.',
    );
  }
}
