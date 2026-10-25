export const PASSWORD_RESET_COMPLETION_STORE = Symbol(
  'PASSWORD_RESET_COMPLETION_STORE',
);

export interface PasswordResetCompletionStoreInput {
  readonly tokenHash: string;
  readonly newPasswordHash: string;
  readonly now: Date;
}

export interface PasswordResetCompletionStore {
  completePasswordReset(
    input: PasswordResetCompletionStoreInput,
  ): Promise<boolean>;
}
