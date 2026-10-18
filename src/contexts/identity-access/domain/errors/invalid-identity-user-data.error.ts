import { DomainError } from '../../../../shared/domain/errors/domain-error.js';

export type IdentityUserDataErrorCode =
  | 'IDENTITY.EMAIL_REQUIRED'
  | 'IDENTITY.PASSWORD_HASH_REQUIRED'
  | 'IDENTITY.EMAIL_VERIFICATION_DATE_INVALID';

export class InvalidIdentityUserDataError extends DomainError {
  override readonly code: IdentityUserDataErrorCode;

  constructor(code: IdentityUserDataErrorCode, internalMessage: string) {
    super(internalMessage);
    this.code = code;
  }
}
