export const REFRESH_TOKEN_FACTORY = Symbol('REFRESH_TOKEN_FACTORY');

export interface GeneratedRefreshToken {
  readonly token: string;
  readonly tokenHash: string;
}

export interface RefreshTokenFactory {
  create(): GeneratedRefreshToken;
  hash(token: string): string;
}
