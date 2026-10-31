import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const ACCESS_CONTROL_ERROR_CODE = {
  ORGANIZATION: {
    NAME_REQUIRED: 'ACCESS_CONTROL.ORGANIZATION_NAME_REQUIRED',
    OWNER_REQUIRED: 'ACCESS_CONTROL.ORGANIZATION_OWNER_REQUIRED',
    SLUG_INVALID: 'ACCESS_CONTROL.ORGANIZATION_SLUG_INVALID',
    STATUS_INVALID: 'ACCESS_CONTROL.ORGANIZATION_STATUS_INVALID',
    ID_REQUIRED: 'ACCESS_CONTROL.ORGANIZATION_ID_REQUIRED',
  },
} as const;

export type OrganizationDataErrorCode =
  (typeof ACCESS_CONTROL_ERROR_CODE.ORGANIZATION)[keyof typeof ACCESS_CONTROL_ERROR_CODE.ORGANIZATION];

export class InvalidOrganizationDataError extends DomainError {
  override readonly code: OrganizationDataErrorCode;

  constructor(code: OrganizationDataErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
