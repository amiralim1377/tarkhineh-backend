import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  USER_AUTHENTICATION_REPOSITORY,
  type UserAuthenticationRepository,
} from '../../../domain/ports/user-authentication.repository.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../ports/password-hasher.port.js';
import {
  PASSWORD_VERIFIER,
  type PasswordVerifier,
} from '../../ports/password-verifier.port.js';
import {
  AUTH_SESSION_REPOSITORY,
  type AuthSessionRepository,
} from '../../../domain/ports/auth-session.repository.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';

import {
  ForgotPasswordCommand,
  ForgotPasswordResult,
} from './forgot-password.command.js';

@CommandHandler(ForgotPasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ForgotPasswordCommand> {
  constructor(
    @Inject(USER_AUTHENTICATION_REPOSITORY)
    private readonly users: UserAuthenticationRepository,
    @Inject(PASSWORD_VERIFIER)
    private readonly passwordVerifier: PasswordVerifier,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly sessions: AuthSessionRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<ForgotPasswordResult> {
    const user = await this.users.findByEmail(command.email);

    return {
      message:
        'If that email address is in our database, we will send you an email to reset your password.',
    };
  }
}
