export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');

export interface IssuedAccessToken {
  accessToken: string;
  expiresInSeconds: number;
}

export interface AccessTokenIssuer {
  issueFor(userId: string): Promise<IssuedAccessToken>;
}
