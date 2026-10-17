export const PASSWORD_VERIFIER = Symbol('PASSWORD_VERIFIER');

export interface PasswordVerifier {
  verify(passwordHash: string, plainPassword: string): Promise<boolean>;
}
