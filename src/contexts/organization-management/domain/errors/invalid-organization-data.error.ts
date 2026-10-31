import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const ORGANIZATION_MANAGEMENT_ERROR_CODE = {
  ORGANIZATION: {
    ID_REQUIRED: 'ORGANIZATION_MANAGEMENT.ORGANIZATION_ID_REQUIRED',
    NAME_REQUIRED: 'ORGANIZATION_MANAGEMENT.ORGANIZATION_NAME_REQUIRED',
    OWNER_REQUIRED: 'ORGANIZATION_MANAGEMENT.ORGANIZATION_OWNER_REQUIRED',
    SLUG_INVALID: 'ORGANIZATION_MANAGEMENT.ORGANIZATION_SLUG_INVALID',
    STATUS_INVALID: 'ORGANIZATION_MANAGEMENT.ORGANIZATION_STATUS_INVALID',
  },
} as const;

export type OrganizationDataErrorCode =
  (typeof ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION)[keyof typeof ORGANIZATION_MANAGEMENT_ERROR_CODE.ORGANIZATION];

export class InvalidOrganizationDataError extends DomainError {
  override readonly code: OrganizationDataErrorCode;

  constructor(code: OrganizationDataErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
