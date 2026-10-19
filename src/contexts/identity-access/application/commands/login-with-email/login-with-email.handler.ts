import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  USER_AUTHENTICATION_REPOSITORY,
  type UserAuthenticationRepository,
} from '../../../domain/ports/user-authentication.repository.js';
import {
  AUTH_SESSION_REPOSITORY,
  type AuthSessionRepository,
} from '../../../domain/ports/auth-session.repository.js';

import {
  PASSWORD_VERIFIER,
  type PasswordVerifier,
} from '../../ports/password-verifier.port.js';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
} from '../../ports/access-token-issuer.port.js';
import {
  REFRESH_TOKEN_FACTORY,
  type RefreshTokenFactory,
} from '../../ports/refresh-token-factory.port.js';
import {
  AUTH_SESSION_POLICY,
  type AuthSessionPolicy,
} from '../../ports/auth-session-policy.port.js';

import { InvalidCredentialsError } from '../../errors/invalid-credentials.error.js';
import {
  LoginWithEmailCommand,
  type LoginWithEmailResult,
} from './login-with-email.command.js';

import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import { AuthSession } from '../../../domain/entities/auth-session.js';

@CommandHandler(LoginWithEmailCommand)
export class LoginWithEmailHandler implements ICommandHandler<LoginWithEmailCommand> {
  constructor(
    @Inject(USER_AUTHENTICATION_REPOSITORY)
    private readonly users: UserAuthenticationRepository,
    @Inject(PASSWORD_VERIFIER)
    private readonly passwordVerifier: PasswordVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly tokenIssuer: AccessTokenIssuer,
    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly sessions: AuthSessionRepository,
    @Inject(REFRESH_TOKEN_FACTORY)
    private readonly refreshTokenFactory: RefreshTokenFactory,
    @Inject(AUTH_SESSION_POLICY)
    private readonly sessionPolicy: AuthSessionPolicy,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(command: LoginWithEmailCommand): Promise<LoginWithEmailResult> {
    const email = command.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    if (!user || !user.canLoginWithPassword() || !user.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const passwordIsValid = await this.passwordVerifier.verify(
      user.passwordHash,
      command.password,
    );

    if (!passwordIsValid) {
      throw new InvalidCredentialsError();
    }

    const now = this.clock.now();

    const authSession = AuthSession.create({
      userId: user.id,
      createdAt: now,
      sessionTtlSeconds: this.sessionPolicy.sessionTtlSeconds,
    });
    const refreshTokenExpiresAt = authSession.calculateRefreshTokenExpiresAt(
      now,
      this.sessionPolicy.refreshTokenTtlSeconds,
    );

    const accessToken = await this.tokenIssuer.issueFor(user.id);
    const refreshToken = this.refreshTokenFactory.create();
    const csrfToken = this.refreshTokenFactory.create();

    const session = await this.sessions.createSession({
      session: authSession,
      initialRefreshTokenHash: refreshToken.tokenHash,
      csrfTokenHash: csrfToken.tokenHash,
      refreshTokenExpiresAt: refreshTokenExpiresAt,
    });

    return {
      accessToken: accessToken.accessToken,
      tokenType: 'Bearer',
      expiresIn: accessToken.expiresInSeconds,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      csrfToken: csrfToken.token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }
}
