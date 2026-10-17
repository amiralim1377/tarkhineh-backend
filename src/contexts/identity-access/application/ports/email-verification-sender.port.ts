export const EMAIL_VERIFICATION_SENDER = Symbol('EMAIL_VERIFICATION_SENDER');

export interface EmailVerificationSender {
  sendVerificationEmail(email: string, rawToken: string): Promise<void>;
}
