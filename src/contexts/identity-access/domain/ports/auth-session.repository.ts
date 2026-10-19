import type { AuthSession } from '../entities/auth-session.js';

export const AUTH_SESSION_REPOSITORY = Symbol('AUTH_SESSION_REPOSITORY');

export type SessionRevocationReason =
  'LOGOUT' | 'REFRESH_TOKEN_REUSE' | 'SECURITY_ACTION';

export interface CreateAuthSessionInput {
  readonly session: AuthSession;
  readonly initialRefreshTokenHash: string;
  readonly csrfTokenHash: string;
  readonly refreshTokenExpiresAt: Date;
}

export interface CreatedAuthSession {
  readonly sessionId: string;
  readonly sessionExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}

export interface RotateRefreshTokenInput {
  currentTokenHash: string;
  currentCsrfTokenHash: string;
  replacementTokenHash: string;
  replacementCsrfTokenHash: string;
  now: Date;
  replacementRefreshTokenTtlSeconds: number;
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
  createSession(input: CreateAuthSessionInput): Promise<CreatedAuthSession>;

  rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshTokenRotationResult>;

  revokeSessionByTokenHash(
    tokenHash: string,
    csrfTokenHash: string,
    now: Date,
  ): Promise<boolean>;

  revokeAllSessionsForUser(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<number>;
}
