export const EMAIL_VERIFICATION_REPOSITORY = Symbol(
  'EMAIL_VERIFICATION_REPOSITORY',
);

export interface EmailVerificationRepository {
  /**
   * Verifies the email for a valid, unexpired, unused token hash.
   * Returns false if the token cannot be used.
   */
  verifyByTokenHash(tokenHash: string, now?: Date): Promise<boolean>;
}
