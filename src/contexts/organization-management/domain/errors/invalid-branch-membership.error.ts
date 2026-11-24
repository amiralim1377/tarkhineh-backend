import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export const BRANCH_MEMBERSHIP_ERROR_CODE = {
  ID_REQUIRED: 'BRANCH_MEMBERSHIP.ID_REQUIRED',

  ORGANIZATION_ID_REQUIRED: 'BRANCH_MEMBERSHIP.ORGANIZATION_ID_REQUIRED',

  BRANCH_ID_REQUIRED: 'BRANCH_MEMBERSHIP.BRANCH_ID_REQUIRED',

  ORGANIZATION_MEMBERSHIP_ID_REQUIRED:
    'BRANCH_MEMBERSHIP.ORGANIZATION_MEMBERSHIP_ID_REQUIRED',

  STATUS_INVALID: 'BRANCH_MEMBERSHIP.STATUS_INVALID',

  TIMESTAMPS_INVALID: 'BRANCH_MEMBERSHIP.TIMESTAMPS_INVALID',
} as const;

export type BranchMembershipErrorCode =
  (typeof BRANCH_MEMBERSHIP_ERROR_CODE)[keyof typeof BRANCH_MEMBERSHIP_ERROR_CODE];

export class InvalidBranchMembershipDataError extends DomainError {
  override readonly code: BranchMembershipErrorCode;

  constructor(code: BranchMembershipErrorCode, message: string) {
    super(message);

    this.code = code;
  }
}
