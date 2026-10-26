export const EMAIL_VERIFICATION_COMPLETION_STORE = Symbol(
  'EMAIL_VERIFICATION_COMPLETION_STORE',
);

export interface EmailVerificationCompletionInput {
  readonly tokenHash: string;
  readonly now: Date;
}

export interface EmailVerificationCompletionStore {
  completeEmailVerification(
    input: EmailVerificationCompletionInput,
  ): Promise<boolean>;
}
