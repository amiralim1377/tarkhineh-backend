import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  AUTH_SESSION_REPOSITORY,
  type AuthSessionRepository,
} from '../../../domain/ports/auth-session.repository.js';
import {
  REFRESH_TOKEN_FACTORY,
  type RefreshTokenFactory,
} from '../../ports/refresh-token-factory.port.js';
import { InvalidRefreshTokenError } from '../../errors/invalid-refresh-token.error.js';
import {
  LogoutSessionCommand,
  type LogoutSessionResult,
} from './logout-session.command.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@CommandHandler(LogoutSessionCommand)
export class LogoutSessionHandler
  implements ICommandHandler<LogoutSessionCommand>
{
  constructor(
    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly sessions: AuthSessionRepository,
    @Inject(REFRESH_TOKEN_FACTORY)
    private readonly refreshTokenFactory: RefreshTokenFactory,
  ) {}

  async execute(
    command: LogoutSessionCommand,
  ): Promise<LogoutSessionResult> {
    if (
      !TOKEN_PATTERN.test(command.refreshToken) ||
      !TOKEN_PATTERN.test(command.csrfToken)
    ) {
      throw new InvalidRefreshTokenError();
    }

    const revoked = await this.sessions.revokeSessionByTokenHash(
      this.refreshTokenFactory.hash(command.refreshToken),
      this.refreshTokenFactory.hash(command.csrfToken),
      new Date(),
    );

    if (!revoked) {
      throw new InvalidRefreshTokenError();
    }

    return { message: 'Logged out successfully.' };
  }
}
