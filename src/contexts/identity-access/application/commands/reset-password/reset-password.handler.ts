import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  ResetPasswordCommand,
  type ResetPasswordResult,
} from './reset-password.command.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import {
  SECURE_TOKEN_FACTORY,
  type SecureTokenFactory,
} from '../../../../../shared/application/ports/secure-token-factory.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../ports/password-hasher.port.js';
import {
  PASSWORD_RESET_COMPLETION_STORE,
  type PasswordResetCompletionStore,
} from '../../ports/password-reset-completion-store.port.js';
import { PasswordPolicy } from '../../../domain/services/password-policy.js';
import { PasswordResetInvalidError } from '../../errors/password-reset.error.js';

const message = 'Your password has been reset successfully.';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<ResetPasswordCommand> {
  constructor(
    @Inject(CLOCK)
    private readonly clock: Clock,
    @Inject(SECURE_TOKEN_FACTORY)
    private readonly tokenFactory: SecureTokenFactory,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(PASSWORD_RESET_COMPLETION_STORE)
    private readonly passwordResetStore: PasswordResetCompletionStore,
    @Inject(PasswordPolicy)
    private readonly passwordPolicy: PasswordPolicy,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<ResetPasswordResult> {
    if (!command.recoveryToken) {
      throw new PasswordResetInvalidError();
    }

    if (!command.newPassword) {
      throw new PasswordRequiredError();
    }

    if (!this.passwordPolicy.isValid(command.newPassword)) {
      throw new PasswordPolicyViolationError();
    }
    const now = this.clock.now();
    const tokenHash = this.tokenFactory.hash(command.recoveryToken);
    const passwordHash = await this.passwordHasher.hash(command.newPassword);

    const completed = await this.passwordResetStore.completePasswordReset({
      now,
      passwordHash,
      tokenHash,
    });

    if (!completed) {
      throw new PasswordResetInvalidError();
    }

    return { message };
  }
}
