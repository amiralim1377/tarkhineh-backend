export const AUTH_SESSION_REPOSITORY = Symbol('AUTH_SESSION_REPOSITORY');

export type SessionRevocationReason =
  | 'LOGOUT'
  | 'REFRESH_TOKEN_REUSE'
  | 'SECURITY_ACTION';

export interface CreateAuthSessionInput {
  readonly userId: string;
  readonly initialRefreshTokenHash: string;
  readonly now: Date;
  readonly sessionExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}

export interface CreatedAuthSession {
  readonly sessionId: string;
  readonly sessionExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}

export interface RotateRefreshTokenInput {
  readonly currentTokenHash: string;
  readonly replacementTokenHash: string;
  readonly now: Date;
  readonly replacementExpiresAt: Date;
}

export type RefreshTokenRotationResult =
  | {
      readonly status: 'ROTATED';
      readonly userId: string;
      readonly sessionId: string;
      readonly sessionExpiresAt: Date;
      readonly refreshTokenExpiresAt: Date;
    }
  | {
      readonly status: 'INVALID';
    }
  | {
      readonly status: 'REUSE_DETECTED';
    };

export interface AuthSessionRepository {
  createSession(
    input: CreateAuthSessionInput,
  ): Promise<CreatedAuthSession>;

  rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshTokenRotationResult>;

  revokeSessionByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<boolean>;

  revokeAllSessionsForUser(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<number>;
}
