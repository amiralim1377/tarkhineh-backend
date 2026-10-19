import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  AUTH_SESSION_REPOSITORY,
  type AuthSessionRepository,
} from '../../../domain/ports/auth-session.repository.js';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
} from '../../ports/access-token-issuer.port.js';
import {
  AUTH_SESSION_POLICY,
  type AuthSessionPolicy,
} from '../../ports/auth-session-policy.port.js';
import {
  REFRESH_TOKEN_FACTORY,
  type RefreshTokenFactory,
} from '../../ports/refresh-token-factory.port.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import { InvalidRefreshTokenError } from '../../errors/invalid-refresh-token.error.js';
import {
  RefreshSessionCommand,
  type RefreshSessionResult,
} from './refresh-session.command.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<RefreshSessionCommand> {
  constructor(
    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly sessions: AuthSessionRepository,
    @Inject(REFRESH_TOKEN_FACTORY)
    private readonly refreshTokenFactory: RefreshTokenFactory,
    @Inject(AUTH_SESSION_POLICY)
    private readonly sessionPolicy: AuthSessionPolicy,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly tokenIssuer: AccessTokenIssuer,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<RefreshSessionResult> {
    if (
      !TOKEN_PATTERN.test(command.refreshToken) ||
      !TOKEN_PATTERN.test(command.csrfToken)
    ) {
      throw new InvalidRefreshTokenError();
    }

    const now = this.clock.now();
    const currentTokenHash = this.refreshTokenFactory.hash(
      command.refreshToken,
    );
    const currentCsrfTokenHash = this.refreshTokenFactory.hash(
      command.csrfToken,
    );

    const replacementRefreshToken = this.refreshTokenFactory.create();
    const replacementCsrfToken = this.refreshTokenFactory.create();

    const rotation = await this.sessions.rotateRefreshToken({
      currentTokenHash,
      currentCsrfTokenHash,
      replacementTokenHash: replacementRefreshToken.tokenHash,
      replacementCsrfTokenHash: replacementCsrfToken.tokenHash,
      now,
      replacementRefreshTokenTtlSeconds:
        this.sessionPolicy.refreshTokenTtlSeconds,
    });

    if (rotation.status !== 'ROTATED') {
      throw new InvalidRefreshTokenError();
    }

    const accessToken = await this.tokenIssuer.issueFor(rotation.userId);

    return {
      accessToken: accessToken.accessToken,
      tokenType: 'Bearer',
      expiresIn: accessToken.expiresInSeconds,
      refreshToken: replacementRefreshToken.token,
      refreshTokenExpiresAt: rotation.refreshTokenExpiresAt,
      csrfToken: replacementCsrfToken.token,
    };
  }
}
