export const SECURE_TOKEN_FACTORY = Symbol('SECURE_TOKEN_FACTORY');

export interface SecureTokenOptions {
  readonly byteLength?: number;
}

export interface IssuedSecureToken {
  readonly rawToken: string;
  readonly tokenHash: string;
}

export interface SecureTokenFactory {
  create(options?: SecureTokenOptions): IssuedSecureToken;
  hash(rawToken: string): string;
}
