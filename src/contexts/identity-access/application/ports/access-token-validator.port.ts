export const ACCESS_TOKEN_VALIDATOR = Symbol('ACCESS_TOKEN_VALIDATOR');

export interface ValidatedAccessToken {
  userId: string;
  expiresAt: number;
}

export interface AccessTokenValidator {
  validate(token: string): Promise<ValidatedAccessToken | null>;
}
