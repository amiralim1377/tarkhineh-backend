import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import {
  EMAIL_REGISTRATION_REPOSITORY,
  type EmailRegistrationRepository,
} from '../../../domain/ports/email-registration.repository.js';

import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../ports/password-hasher.port.js';

import {
  EMAIL_VERIFICATION_TOKEN_FACTORY,
  type EmailVerificationTokenFactory,
} from '../../ports/email-verification-token-factory.port.js';

import {
  EMAIL_VERIFICATION_SENDER,
  type EmailVerificationSender,
} from '../../ports/email-verification-sender.port.js';

import {
  RegisterWithEmailCommand,
  type RegisterWithEmailResult,
} from './register-with-email.command.js';
import { InputValidationError } from '../../../../../shared/application/errors/input-validation.error.js';

const REGISTRATION_MESSAGE =
  'If this email can be registered, a verification email will be sent.';

@CommandHandler(RegisterWithEmailCommand)
export class RegisterWithEmailHandler implements ICommandHandler<RegisterWithEmailCommand> {
  constructor(
    @Inject(EMAIL_REGISTRATION_REPOSITORY)
    private readonly registrations: EmailRegistrationRepository,

    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,

    @Inject(EMAIL_VERIFICATION_TOKEN_FACTORY)
    private readonly tokenFactory: EmailVerificationTokenFactory,

    @Inject(EMAIL_VERIFICATION_SENDER)
    private readonly emailSender: EmailVerificationSender,
  ) {}

  async execute(
    command: RegisterWithEmailCommand,
  ): Promise<RegisterWithEmailResult> {
    const email = command.email.trim().toLowerCase();
    const displayName = command.displayName?.trim() || null;

    if (command.password.length < 12) {
      throw new InputValidationError([
        {
          field: 'password',
          code: 'VALIDATION.MIN_LENGTH',
          params: { min: 12 },
        },
      ]);
    }

    if (command.password.length > 1024) {
      throw new InputValidationError([
        {
          field: 'password',
          code: 'VALIDATION.MAX_LENGTH',
          params: { max: 1024 },
        },
      ]);
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const token = this.tokenFactory.create();

    const created = await this.registrations.createPendingRegistration({
      email,
      passwordHash,
      displayName,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
    });

    if (created) {
      await this.emailSender.sendVerificationEmail(email, token.rawToken);
    }

    return { message: REGISTRATION_MESSAGE };
  }
}
