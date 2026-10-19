import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import { InvalidAuthSessionDataError } from '../errors/invalid-auth-session-data.error.js';

export type AuthSessionRevocationReason =
  'LOGOUT' | 'REFRESH_TOKEN_REUSE' | 'SECURITY_ACTION';

export interface AuthSessionProps {
  id: string;
  userId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: AuthSessionRevocationReason | null;
}

export interface CreateAuthSession {
  id?: string;
  userId: string;
  createdAt: Date;
  sessionTtlSeconds: number;
}
export class AuthSession extends Entity<UniqueId> {
  private constructor(private readonly props: AuthSessionProps) {
    super(new UniqueId(props.id));
  }

  static create(input: CreateAuthSession): AuthSession {
    if (!Number.isFinite(input.createdAt.getTime())) {
      throw new InvalidAuthSessionDataError(
        'IDENTITY.AUTH_SESSION_CREATED_AT_INVALID',
        'Authentication session creation date must be valid.',
      );
    }

    if (
      !Number.isSafeInteger(input.sessionTtlSeconds) ||
      input.sessionTtlSeconds <= 0
    ) {
      throw new InvalidAuthSessionDataError(
        'IDENTITY.AUTH_SESSION_TTL_INVALID',
        'Authentication session lifetime must be a positive integer.',
      );
    }

    const id = new UniqueId(input.id).getValue();

    const expiresAt = new Date(
      input.createdAt.getTime() + input.sessionTtlSeconds * 1000,
    );

    const props: AuthSessionProps = {
      id,
      userId: input.userId,
      createdAt: new Date(input.createdAt.getTime()),
      lastUsedAt: new Date(input.createdAt.getTime()),
      expiresAt,
      revokedAt: null,
      revocationReason: null,
    };

    this.validateProps(props);

    return new AuthSession(props);
  }
  static reconstitute(props: AuthSessionProps): AuthSession {
    this.validateProps(props);

    return new AuthSession({
      ...props,
      createdAt: new Date(props.createdAt.getTime()),
      lastUsedAt:
        props.lastUsedAt === null ? null : new Date(props.lastUsedAt.getTime()),
      expiresAt: new Date(props.expiresAt.getTime()),
      revokedAt:
        props.revokedAt === null ? null : new Date(props.revokedAt.getTime()),
    });
  }

  private static validateProps(props: AuthSessionProps): void {
    const invalid = (code: string, message: string): never => {
      throw new InvalidAuthSessionDataError(code, message);
    };

    if (props.id.trim().length === 0) {
      invalid(
        'IDENTITY.AUTH_SESSION_ID_REQUIRED',
        'Authentication session ID cannot be empty.',
      );
    }

    if (props.userId.trim().length === 0) {
      invalid(
        'IDENTITY.AUTH_SESSION_USER_ID_REQUIRED',
        'Authentication session user ID cannot be empty.',
      );
    }

    if (!Number.isFinite(props.createdAt.getTime())) {
      invalid(
        'IDENTITY.AUTH_SESSION_CREATED_AT_INVALID',
        'Authentication session creation date must be valid.',
      );
    }

    if (!Number.isFinite(props.expiresAt.getTime())) {
      invalid(
        'IDENTITY.AUTH_SESSION_EXPIRES_AT_INVALID',
        'Authentication session expiry date must be valid.',
      );
    }

    if (props.expiresAt <= props.createdAt) {
      invalid(
        'IDENTITY.AUTH_SESSION_EXPIRY_INVALID',
        'Authentication session must expire after creation.',
      );
    }

    if (
      props.lastUsedAt !== null &&
      (!Number.isFinite(props.lastUsedAt.getTime()) ||
        props.lastUsedAt < props.createdAt)
    ) {
      invalid(
        'IDENTITY.AUTH_SESSION_LAST_USED_AT_INVALID',
        'Last-used date must be valid and cannot precede creation.',
      );
    }

    if (
      props.revokedAt !== null &&
      (!Number.isFinite(props.revokedAt.getTime()) ||
        props.revokedAt < props.createdAt)
    ) {
      invalid(
        'IDENTITY.AUTH_SESSION_REVOKED_AT_INVALID',
        'Revocation date must be valid and cannot precede creation.',
      );
    }

    const validReasons: AuthSessionRevocationReason[] = [
      'LOGOUT',
      'REFRESH_TOKEN_REUSE',
      'SECURITY_ACTION',
    ];

    if ((props.revokedAt === null) !== (props.revocationReason === null)) {
      invalid(
        'IDENTITY.AUTH_SESSION_REVOCATION_STATE_INVALID',
        'Revocation date and reason must either both be set or both be null.',
      );
    }

    if (
      props.revocationReason !== null &&
      !validReasons.includes(props.revocationReason)
    ) {
      invalid(
        'IDENTITY.AUTH_SESSION_REVOCATION_REASON_INVALID',
        'Authentication session revocation reason is invalid.',
      );
    }
  }

  get id(): string {
    return this.getId().getValue();
  }

  get userId(): string {
    return this.props.userId;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get lastUsedAt(): Date | null {
    return this.props.lastUsedAt === null
      ? null
      : new Date(this.props.lastUsedAt.getTime());
  }

  get expiresAt(): Date {
    return new Date(this.props.expiresAt.getTime());
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt === null
      ? null
      : new Date(this.props.revokedAt.getTime());
  }

  get revocationReason(): AuthSessionRevocationReason | null {
    return this.props.revocationReason;
  }

  isActiveAt(now: Date): boolean {
    return (
      Number.isFinite(now.getTime()) &&
      now >= this.props.createdAt &&
      now < this.props.expiresAt &&
      this.props.revokedAt === null
    );
  }

  calculateRefreshTokenExpiresAt(issuedAt: Date, ttlSeconds: number): Date {
    if (
      !Number.isFinite(issuedAt.getTime()) ||
      !Number.isSafeInteger(ttlSeconds) ||
      ttlSeconds <= 0
    ) {
      throw new InvalidAuthSessionDataError(
        'IDENTITY.REFRESH_TOKEN_TTL_INVALID',
        'Refresh token lifetime must be valid.',
      );
    }

    if (!this.isActiveAt(issuedAt)) {
      throw new InvalidAuthSessionDataError(
        'IDENTITY.AUTH_SESSION_NOT_ACTIVE',
        'Cannot issue a refresh token for an inactive session.',
      );
    }

    const requestedExpiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    if (!Number.isFinite(requestedExpiresAt.getTime())) {
      throw new InvalidAuthSessionDataError(
        'IDENTITY.REFRESH_TOKEN_EXPIRY_INVALID',
        'Refresh token expiry date must be valid.',
      );
    }

    return new Date(
      Math.min(requestedExpiresAt.getTime(), this.props.expiresAt.getTime()),
    );
  }

  recordActivity(at: Date): boolean {
    if (!this.isActiveAt(at)) {
      return false;
    }

    if (this.props.lastUsedAt !== null && at < this.props.lastUsedAt) {
      return false;
    }

    this.props.lastUsedAt = new Date(at.getTime());

    return true;
  }

  revoke(at: Date, reason: AuthSessionRevocationReason): boolean {
    if (
      !Number.isFinite(at.getTime()) ||
      at < this.props.createdAt ||
      this.props.revokedAt !== null
    ) {
      return false;
    }

    this.props.revokedAt = new Date(at.getTime());
    this.props.revocationReason = reason;

    return true;
  }
}
