export const AUTH_SESSION_POLICY = Symbol('AUTH_SESSION_POLICY');

export interface AuthSessionPolicy {
  readonly refreshTokenTtlSeconds: number;
  readonly sessionTtlSeconds: number;
}
