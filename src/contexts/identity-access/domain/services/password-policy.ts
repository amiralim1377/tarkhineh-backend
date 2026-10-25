export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 1024;

export class PasswordPolicy {
  isValid(password: string): boolean {
    const hasValidLength =
      password.length >= MIN_PASSWORD_LENGTH &&
      password.length <= MAX_PASSWORD_LENGTH;

    const hasUppercase = /[A-Z]/.test(password);

    return hasValidLength && hasUppercase;
  }
}
