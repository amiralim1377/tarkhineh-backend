export const PASSWORD_CHANGE_STORE = Symbol('PASSWORD_CHANGE_STORE');

export interface PasswordChangeStoreInput {
  readonly userId: string;
  readonly currentPasswordHash: string;
  readonly newPasswordHash: string;
  readonly operationId: string;
  readonly now: Date;
}

export interface PasswordChangeStore {
  changePasswordAndEnqueueNotification(
    input: PasswordChangeStoreInput,
  ): Promise<boolean>;
}
