import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { EMAIL_REGISTRATION_REPOSITORY } from './domain/ports/email-registration.repository.js';
import { EMAIL_VERIFICATION_REPOSITORY } from './domain/ports/email-verification.repository.js';
import { USER_AUTHENTICATION_REPOSITORY } from './domain/ports/user-authentication.repository.js';
import { ACCESS_TOKEN_IDENTITY_READER } from './application/ports/access-token-identity-reader.port.js';
import { PrismaAccessTokenIdentityReader } from './infrastructure/persistence/prisma-access-token-identity-reader.js';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port.js';
import { PASSWORD_VERIFIER } from './application/ports/password-verifier.port.js';
import { EMAIL_VERIFICATION_TOKEN_FACTORY } from './application/ports/email-verification-token-factory.port.js';
import { EMAIL_VERIFICATION_SENDER } from './application/ports/email-verification-sender.port.js';
import { EMAIL_TOKEN_ENCRYPTOR } from './application/ports/email-token-encryptor.port.js';
import { ACCESS_TOKEN_ISSUER } from './application/ports/access-token-issuer.port.js';
import { ACCESS_TOKEN_VALIDATOR } from './application/ports/access-token-validator.port.js';
import { AUTH_SESSION_REPOSITORY } from './domain/ports/auth-session.repository.js';
import { REFRESH_TOKEN_FACTORY } from './application/ports/refresh-token-factory.port.js';
import {
  AUTH_SESSION_POLICY,
  type AuthSessionPolicy,
} from './application/ports/auth-session-policy.port.js';
import { PrismaAuthSessionRepository } from './infrastructure/persistence/prisma-auth-session.repository.js';
import { SecureRefreshTokenFactory } from './infrastructure/security/secure-refresh-token.factory.js';
import { RegisterWithEmailHandler } from './application/commands/register-with-email/register-with-email.handler.js';
import { VerifyEmailHandler } from './application/commands/verify-email/verify-email.handler.js';
import { LoginWithEmailHandler } from './application/commands/login-with-email/login-with-email.handler.js';
import { RefreshSessionHandler } from './application/commands/refresh-session/refresh-session.handler.js';
import { LogoutSessionHandler } from './application/commands/logout-session/logout-session.handler.js';
import { PrismaEmailRegistrationRepository } from './infrastructure/persistence/prisma-email-registration.repository.js';
import { PrismaEmailVerificationRepository } from './infrastructure/persistence/prisma-email-verification.repository.js';
import { PrismaUserAuthenticationRepository } from './infrastructure/persistence/prisma-user-authentication.repository.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { Argon2PasswordVerifier } from './infrastructure/security/argon2-password-verifier.js';
import { SecureEmailVerificationTokenFactory } from './infrastructure/security/secure-email-verification-token.factory.js';
import { SmtpEmailVerificationSender } from './infrastructure/security/smtp-email-verification.sender.js';
import { AesGcmEmailTokenEncryptor } from './infrastructure/security/aes-gcm-email-token-encryptor.js';
import { JwtAccessTokenIssuer } from './infrastructure/security/jwt-access-token-issuer.js';
import { JwtAccessTokenValidator } from './infrastructure/security/jwt-access-token-validator.js';
import { BearerJwtStrategy } from './presentation/http/auth/strategies/bearer-jwt.strategy.js';
import { CookieJwtStrategy } from './presentation/http/auth/strategies/cookie-jwt.strategy.js';
import { EmailVerificationProcessor } from './infrastructure/security/email-verification.processor.js';
import { EmailOutboxDispatcher } from './infrastructure/queue/email-outbox-dispatcher.js';
import { IdentityAccessController } from './presentation/http/controllers/identity-access.controller.js';
import { APP_GUARD } from '@nestjs/core';
import { AuthenticationGuard } from './presentation/http/auth/guards/authentication.guard.js';
import {
  AUTHENTICATION_STRATEGIES,
  type AuthenticationStrategy,
} from './presentation/http/auth/contracts/authentication-strategy.js';
import { ChangePasswordHandler } from './application/commands/change-password/change-password.handler.js';
import { SharedModule } from '../../shared/shared.module.js';

@Module({
  imports: [
    ConfigModule,
    CqrsModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    BullModule.registerQueue({
      name: 'email-verification',
    }),
    SharedModule,
  ],
  controllers: [IdentityAccessController],
  providers: [
    PrismaEmailRegistrationRepository,
    PrismaEmailVerificationRepository,
    PrismaUserAuthenticationRepository,
    PrismaAccessTokenIdentityReader,
    PrismaAuthSessionRepository,
    SecureRefreshTokenFactory,
    Argon2PasswordHasher,
    Argon2PasswordVerifier,
    SecureEmailVerificationTokenFactory,
    SmtpEmailVerificationSender,
    AesGcmEmailTokenEncryptor,
    JwtAccessTokenIssuer,
    JwtAccessTokenValidator,
    BearerJwtStrategy,
    CookieJwtStrategy,
    RegisterWithEmailHandler,
    VerifyEmailHandler,
    LoginWithEmailHandler,
    RefreshSessionHandler,
    LogoutSessionHandler,
    EmailVerificationProcessor,
    EmailOutboxDispatcher,
    ChangePasswordHandler,
    {
      provide: EMAIL_REGISTRATION_REPOSITORY,
      useExisting: PrismaEmailRegistrationRepository,
    },
    {
      provide: EMAIL_VERIFICATION_REPOSITORY,
      useExisting: PrismaEmailVerificationRepository,
    },
    {
      provide: USER_AUTHENTICATION_REPOSITORY,
      useExisting: PrismaUserAuthenticationRepository,
    },
    {
      provide: ACCESS_TOKEN_IDENTITY_READER,
      useExisting: PrismaAccessTokenIdentityReader,
    },
    {
      provide: PASSWORD_HASHER,
      useExisting: Argon2PasswordHasher,
    },
    {
      provide: PASSWORD_VERIFIER,
      useExisting: Argon2PasswordVerifier,
    },
    {
      provide: EMAIL_VERIFICATION_TOKEN_FACTORY,
      useExisting: SecureEmailVerificationTokenFactory,
    },
    {
      provide: EMAIL_VERIFICATION_SENDER,
      useExisting: SmtpEmailVerificationSender,
    },
    {
      provide: EMAIL_TOKEN_ENCRYPTOR,
      useExisting: AesGcmEmailTokenEncryptor,
    },
    {
      provide: AUTH_SESSION_REPOSITORY,
      useExisting: PrismaAuthSessionRepository,
    },
    {
      provide: REFRESH_TOKEN_FACTORY,
      useExisting: SecureRefreshTokenFactory,
    },
    {
      provide: AUTH_SESSION_POLICY,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): AuthSessionPolicy => ({
        refreshTokenTtlSeconds: configService.getOrThrow<number>(
          'REFRESH_TOKEN_TTL_SECONDS',
        ),
        sessionTtlSeconds: configService.getOrThrow<number>(
          'AUTH_SESSION_TTL_SECONDS',
        ),
      }),
    },
    {
      provide: ACCESS_TOKEN_ISSUER,
      useExisting: JwtAccessTokenIssuer,
    },
    {
      provide: ACCESS_TOKEN_VALIDATOR,
      useExisting: JwtAccessTokenValidator,
    },
    {
      provide: AUTHENTICATION_STRATEGIES,
      inject: [BearerJwtStrategy, CookieJwtStrategy],
      useFactory: (
        bearerJwtStrategy: BearerJwtStrategy,
        cookieJwtStrategy: CookieJwtStrategy,
      ): readonly AuthenticationStrategy[] => [
        bearerJwtStrategy,
        cookieJwtStrategy,
      ],
    },
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
  ],
})
export class IdentityAccessModule {}
