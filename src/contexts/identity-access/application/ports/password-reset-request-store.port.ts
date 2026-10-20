export const PASSWORD_RESET_REQUEST_STORE = Symbol(
  'PASSWORD_RESET_REQUEST_STORE',
);

export interface CreatePasswordResetRequestInput {
  readonly email: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
  readonly encryptedPayload: string;
}

export interface PasswordResetRequestStore {
  createPasswordResetRequest(
    input: CreatePasswordResetRequestInput,
  ): Promise<void>;
}
