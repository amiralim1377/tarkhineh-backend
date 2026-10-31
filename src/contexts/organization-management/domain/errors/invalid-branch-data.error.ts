import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const BRANCH_ERROR_CODE = {
  ID_REQUIRED: 'ORGANIZATION_MANAGEMENT.BRANCH_ID_REQUIRED',
  NAME_REQUIRED: 'ORGANIZATION_MANAGEMENT.BRANCH_NAME_REQUIRED',
  ORGANIZATION_ID_REQUIRED:
    'ORGANIZATION_MANAGEMENT.BRANCH_ORGANIZATION_ID_REQUIRED',
  SLUG_INVALID: 'ORGANIZATION_MANAGEMENT.BRANCH_SLUG_INVALID',
  STATUS_INVALID: 'ORGANIZATION_MANAGEMENT.BRANCH_STATUS_INVALID',
} as const;

export type BranchDataErrorCode =
  (typeof BRANCH_ERROR_CODE)[keyof typeof BRANCH_ERROR_CODE];

export class InvalidBranchDataError extends DomainError {
  override readonly code: BranchDataErrorCode;

  constructor(code: BranchDataErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
