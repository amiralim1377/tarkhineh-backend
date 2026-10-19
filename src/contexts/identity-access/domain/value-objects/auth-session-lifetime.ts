export interface AuthSessionLifetimeInput {
  readonly now: Date;
  readonly sessionTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
}

export class AuthSessionLifetime {
  private constructor(
    private readonly createdAtValue: Date,
    private readonly sessionExpiresAtValue: Date,
    private readonly refreshTokenExpiresAtValue: Date,
  ) {}

  static calculate(input: AuthSessionLifetimeInput): AuthSessionLifetime {
    const { now, sessionTtlSeconds, refreshTokenTtlSeconds } = input;

    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(sessionTtlSeconds) ||
      sessionTtlSeconds <= 0 ||
      !Number.isSafeInteger(refreshTokenTtlSeconds) ||
      refreshTokenTtlSeconds <= 0
    ) {
      throw new RangeError('Authentication session lifetime is invalid');
    }

    const sessionExpiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000);

    const requestedRefreshTokenExpiresAt = new Date(
      now.getTime() + refreshTokenTtlSeconds * 1000,
    );

    const refreshTokenExpiresAt = new Date(
      Math.min(
        requestedRefreshTokenExpiresAt.getTime(),
        sessionExpiresAt.getTime(),
      ),
    );

    if (
      !Number.isFinite(sessionExpiresAt.getTime()) ||
      !Number.isFinite(refreshTokenExpiresAt.getTime()) ||
      sessionExpiresAt <= now ||
      refreshTokenExpiresAt <= now
    ) {
      throw new RangeError('Authentication session expiry is invalid');
    }

    return new AuthSessionLifetime(
      new Date(now.getTime()),
      sessionExpiresAt,
      refreshTokenExpiresAt,
    );
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  get sessionExpiresAt(): Date {
    return new Date(this.sessionExpiresAtValue.getTime());
  }

  get refreshTokenExpiresAt(): Date {
    return new Date(this.refreshTokenExpiresAtValue.getTime());
  }
}
