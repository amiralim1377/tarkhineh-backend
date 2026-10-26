import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  PASSWORD_CHANGE_STORE,
  type PasswordChangeStore,
} from '../../ports/password-change-store.port.js';

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
import { PasswordPolicy } from '../../../domain/services/password-policy.js';
import {
  PasswordPolicyViolationError,
  PasswordRequiredError,
} from '../../errors/password-policy.error.js';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand> {
  constructor(
    @Inject(USER_AUTHENTICATION_REPOSITORY)
    private readonly users: UserAuthenticationRepository,
    @Inject(PASSWORD_VERIFIER)
    private readonly passwordVerifier: PasswordVerifier,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(PASSWORD_CHANGE_STORE)
    private readonly passwordChangeStore: PasswordChangeStore,
    @Inject(CLOCK)
    private readonly clock: Clock,
    private readonly passwordPolicy: PasswordPolicy,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<ChangePasswordResult> {
    // 1. Load the current user.
    const user = await this.users.findById(command.userId);

    if (!user || !user.canLoginWithPassword() || !user.passwordHash) {
      throw new ChangePasswordCredentialsError();
    }

    // 2. Verify the current password.
    const currentPasswordIsValid = await this.passwordVerifier.verify(
      user.passwordHash,
      command.currentPassword,
    );

    if (!currentPasswordIsValid) {
      throw new ChangePasswordCredentialsError();
    }

    // 3. Prevent reusing the current password.

    if (!command.newPassword || !command.newPassword.trim()) {
      throw new PasswordRequiredError();
    }
    // 4. Validate the new password policy.
    if (!this.passwordPolicy.isValid(command.newPassword)) {
      throw new PasswordPolicyViolationError();
    }

    const newPasswordMatchesCurrent = await this.passwordVerifier.verify(
      user.passwordHash,
      command.newPassword,
    );

    if (newPasswordMatchesCurrent) {
      throw new PasswordUnchangedError();
    }

    // 5. Hash before entering the database transaction.
    const newPasswordHash = await this.passwordHasher.hash(command.newPassword);

    // 6. Atomically change the password, revoke sessions,
    // and enqueue the security notification.
    const changed =
      await this.passwordChangeStore.changePasswordAndEnqueueNotification({
        userId: user.id,
        currentPasswordHash: user.passwordHash,
        newPasswordHash,
        operationId: randomUUID(),
        now: this.clock.now(),
      });

    if (!changed) {
      throw new ChangePasswordCredentialsError();
    }

    return {
      message: 'Password changed successfully.',
    };
  }
}
