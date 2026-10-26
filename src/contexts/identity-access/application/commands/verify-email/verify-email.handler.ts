import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  EMAIL_VERIFICATION_COMPLETION_STORE,
  type EmailVerificationCompletionStore,
} from '../../ports/email-verification-completion-store.port.js';

import {
  EMAIL_VERIFICATION_TOKEN_FACTORY,
  type EmailVerificationTokenFactory,
} from '../../ports/email-verification-token-factory.port.js';

import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';

import { InvalidEmailVerificationTokenError } from '../../errors/invalid-email-verification-token.error.js';

import {
  VerifyEmailCommand,
  type VerifyEmailResult,
} from './verify-email.command.js';

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand> {
  constructor(
    @Inject(EMAIL_VERIFICATION_COMPLETION_STORE)
    private readonly verificationStore: EmailVerificationCompletionStore,
    @Inject(EMAIL_VERIFICATION_TOKEN_FACTORY)
    private readonly tokenFactory: EmailVerificationTokenFactory,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<VerifyEmailResult> {
    // 1. Hash the raw token before passing it to persistence.
    const tokenHash = this.tokenFactory.hash(command.token);

    // 2. Complete email verification and enqueue the welcome email
    // within one database transaction.
    const verified = await this.verificationStore.completeEmailVerification({
      tokenHash,
      now: this.clock.now(),
    });

    // 3. Handle invalid, expired, or already-used tokens.
    if (!verified) {
      throw new InvalidEmailVerificationTokenError();
    }

    return {
      message: 'Email verified successfully.',
    };
  }
}
