import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../ports/password-hasher.port.js';

import {
  EMAIL_VERIFICATION_TOKEN_FACTORY,
  type EmailVerificationTokenFactory,
} from '../../ports/email-verification-token-factory.port.js';

import {
  RegisterWithEmailCommand,
  type RegisterWithEmailResult,
} from './register-with-email.command.js';
import { InputValidationError } from '../../../../../shared/application/errors/input-validation.error.js';
import {
  EMAIL_TOKEN_ENCRYPTOR,
  type EmailTokenEncryptor,
} from '../../ports/email-token-encryptor.port.js';
import { IdentityUser } from '../../../domain/entities/identity-user.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import {
  EMAIL_REGISTRATION_REPOSITORY,
  type EmailRegistrationRepository,
} from '../../../domain/ports/email-registration.repository.js';

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
    @Inject(EMAIL_TOKEN_ENCRYPTOR)
    private readonly tokenEncryptor: EmailTokenEncryptor,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RegisterWithEmailCommand,
  ): Promise<RegisterWithEmailResult> {
    const email = command.email.trim().toLowerCase();
    const displayName = command.displayName?.trim() || null;

    if (command.password.length < 8) {
      throw new InputValidationError([
        {
          field: 'password',
          code: 'VALIDATION.MIN_LENGTH',
          params: { min: 8 },
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

    const user = IdentityUser.registerPending({
      email,
      passwordHash,
      displayName,
    });

    const token = this.tokenFactory.create();
    const encryptedToken = this.tokenEncryptor.encrypt(token.rawToken);

    await this.registrations.createPendingRegistration({
      user,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      encryptedPayload: encryptedToken,
      now: this.clock.now(),
    });

    return { message: REGISTRATION_MESSAGE };
  }
}
