import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const ORGANIZATION_MEMBERSHIP_ERROR_CODE = {
  ID_REQUIRED: 'ORGANIZATION_MANAGEMENT.ORGANIZATION_MEMBERSHIP_ID_REQUIRED',

  ORGANIZATION_ID_REQUIRED:
    'ORGANIZATION_MANAGEMENT.ORGANIZATION_MEMBERSHIP_ORGANIZATION_ID_REQUIRED',

  USER_ID_REQUIRED:
    'ORGANIZATION_MANAGEMENT.ORGANIZATION_MEMBERSHIP_USER_ID_REQUIRED',

  STATUS_INVALID:
    'ORGANIZATION_MANAGEMENT.ORGANIZATION_MEMBERSHIP_STATUS_INVALID',

  TIMESTAMPS_INVALID:
    'ORGANIZATION_MANAGEMENT.ORGANIZATION_MEMBERSHIP_TIMESTAMPS_INVALID',
} as const;

export type OrganizationMembershipDataErrorCode =
  (typeof ORGANIZATION_MEMBERSHIP_ERROR_CODE)[keyof typeof ORGANIZATION_MEMBERSHIP_ERROR_CODE];

export class InvalidOrganizationMembershipDataError extends DomainError {
  override readonly code: OrganizationMembershipDataErrorCode;

  constructor(
    code: OrganizationMembershipDataErrorCode,
    internalMessage: string,
  ) {
    super(internalMessage);
    this.code = code;
  }
}
