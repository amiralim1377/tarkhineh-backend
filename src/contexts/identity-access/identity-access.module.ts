import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaModule } from '../../prisma/prisma.module.js';

import {
  EMAIL_REGISTRATION_REPOSITORY,
} from './domain/ports/email-registration.repository.js';

import {
  PASSWORD_HASHER,
} from './application/ports/password-hasher.port.js';

import {
  EMAIL_VERIFICATION_TOKEN_FACTORY,
} from './application/ports/email-verification-token-factory.port.js';

import {
  EMAIL_VERIFICATION_SENDER,
} from './application/ports/email-verification-sender.port.js';

import { RegisterWithEmailHandler } from './application/commands/register-with-email/register-with-email.handler.js';

import { PrismaEmailRegistrationRepository } from './infrastructure/persistence/prisma-email-registration.repository.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { SecureEmailVerificationTokenFactory } from './infrastructure/security/secure-email-verification-token.factory.js';
import { SmtpEmailVerificationSender } from './infrastructure/security/smtp-email-verification.sender.js';

import { IdentityAccessController } from './presentation/http/identity-access.controller.js';

@Module({
  imports: [
    ConfigModule,
    CqrsModule,
    PrismaModule,
  ],
  controllers: [IdentityAccessController],
  providers: [
    RegisterWithEmailHandler,

    PrismaEmailRegistrationRepository,
    Argon2PasswordHasher,
    SecureEmailVerificationTokenFactory,
    SmtpEmailVerificationSender,

    {
      provide: EMAIL_REGISTRATION_REPOSITORY,
      useExisting: PrismaEmailRegistrationRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useExisting: Argon2PasswordHasher,
    },
    {
      provide: EMAIL_VERIFICATION_TOKEN_FACTORY,
      useExisting: SecureEmailVerificationTokenFactory,
    },
    {
      provide: EMAIL_VERIFICATION_SENDER,
      useExisting: SmtpEmailVerificationSender,
    },
  ],
})
export class IdentityAccessModule {}
