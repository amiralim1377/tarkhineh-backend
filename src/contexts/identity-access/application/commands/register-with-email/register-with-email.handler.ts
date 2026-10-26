import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { IdentityUser } from '../../../domain/entities/identity-user.js';
import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import {
  EMAIL_REGISTRATION_REPOSITORY,
  type EmailRegistrationRepository,
} from '../../../domain/ports/email-registration.repository.js';
import {
  OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
  type OutboundEmailPayloadEncryptor,
} from '../../../../outbound-email/application/ports/outbound-email-payload-encryptor.port.js';

import {
  PasswordPolicyViolationError,
  PasswordRequiredError,
} from '../../errors/password-policy.error.js';

import { PasswordPolicy } from '../../../domain/services/password-policy.js';

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
    @Inject(OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR)
    private readonly payloadEncryptor: OutboundEmailPayloadEncryptor,
    @Inject(CLOCK)
    private readonly clock: Clock,
    private readonly configService: ConfigService,
    @Inject(PasswordPolicy)
    private readonly passwordPolicy: PasswordPolicy,
  ) {}

  async execute(
    command: RegisterWithEmailCommand,
  ): Promise<RegisterWithEmailResult> {
    const now = this.clock.now();
    const email = command.email.trim().toLowerCase();
    const displayName = command.displayName?.trim() || null;

    if (!command.password.trim()) {
      throw new PasswordRequiredError();
    }

    if (!this.passwordPolicy.isValid(command.password)) {
      throw new PasswordPolicyViolationError();
    }

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

    // Use the Outbound Email payload encryptor and store a versioned JSON
    // payload, matching the contract consumed by OutboundEmailDeliveryHandler.
    const apiPublicUrl =
      this.configService.getOrThrow<string>('API_PUBLIC_URL');
    const verificationUrl = new URL('/auth/verify-email', apiPublicUrl);
    verificationUrl.searchParams.set('token', token.rawToken);

    const payload = JSON.stringify({
      email,
      verificationUrl: verificationUrl.toString(),
    });
    const encryptedPayload = this.payloadEncryptor.encrypt(payload);

    await this.registrations.createPendingRegistration({
      user,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      encryptedPayload,
      now,
    });

    return { message: REGISTRATION_MESSAGE };
  }
}
