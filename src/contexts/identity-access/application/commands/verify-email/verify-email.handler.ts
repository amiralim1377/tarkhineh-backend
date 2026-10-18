import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  EMAIL_VERIFICATION_REPOSITORY,
  type EmailVerificationRepository,
} from '../../../domain/ports/email-verification.repository.js';

import {
  EMAIL_VERIFICATION_TOKEN_FACTORY,
  type EmailVerificationTokenFactory,
} from '../../ports/email-verification-token-factory.port.js';

import { InvalidEmailVerificationTokenError } from '../../errors/invalid-email-verification-token.error.js';

import {
  VerifyEmailCommand,
  type VerifyEmailResult,
} from './verify-email.command.js';

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand> {
  constructor(
    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly verificationRepository: EmailVerificationRepository,

    @Inject(EMAIL_VERIFICATION_TOKEN_FACTORY)
    private readonly tokenFactory: EmailVerificationTokenFactory,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<VerifyEmailResult> {
    const tokenHash = this.tokenFactory.hash(command.token);

    const verified =
      await this.verificationRepository.verifyByTokenHash(tokenHash);

    if (!verified) {
      throw new InvalidEmailVerificationTokenError();
    }

    return {
      message: 'Email verified successfully.',
    };
  }
}
