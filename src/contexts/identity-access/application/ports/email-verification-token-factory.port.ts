export const EMAIL_VERIFICATION_TOKEN_FACTORY = Symbol(
  'EMAIL_VERIFICATION_TOKEN_FACTORY',
);

export interface EmailVerificationToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface EmailVerificationTokenFactory {
  create(): EmailVerificationToken;
}
