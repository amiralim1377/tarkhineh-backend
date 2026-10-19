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
  ChangePasswordCommand,
  ChangePasswordResult,
} from './change-password.command.js';
import {
  ChangePasswordCredentialsError,
  PasswordUnchangedError,
} from '../../errors/change-password.errors.js';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand> {
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

  async execute(command: ChangePasswordCommand): Promise<ChangePasswordResult> {
    const user = await this.users.findById(command.userId);

    if (!user || !user.canLoginWithPassword() || !user.passwordHash) {
      throw new ChangePasswordCredentialsError();
    }

    const currentPasswordIsValid = await this.passwordVerifier.verify(
      user.passwordHash,
      command.currentPassword,
    );

    if (!currentPasswordIsValid) {
      throw new ChangePasswordCredentialsError();
    }

    const newPasswordMatchesCurrent = await this.passwordVerifier.verify(
      user.passwordHash,
      command.newPassword,
    );

    if (newPasswordMatchesCurrent) {
      throw new PasswordUnchangedError();
    }

    const newPasswordHash = await this.passwordHasher.hash(command.newPassword);

    const changed = await this.users.changePassword({
      userId: user.id,
      currentPasswordHash: user.passwordHash,
      newPasswordHash,
    });

    if (!changed) {
      throw new ChangePasswordCredentialsError();
    }

    await this.sessions.revokeAllSessionsForUser(
      user.id,
      'SECURITY_ACTION',
      this.clock.now(),
    );

    return { message: 'Password changed successfully.' };
  }
}
