import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';

import {
  CLOCK,
  type Clock,
} from '../../../../../shared/application/ports/clock.port.js';
import {
  SECURE_TOKEN_FACTORY,
  type SecureTokenFactory,
} from '../../../../../shared/application/ports/secure-token-factory.port.js';

import {
  PASSWORD_RESET_REQUEST_STORE,
  type PasswordResetRequestStore,
} from '../../ports/password-reset-request-store.port.js';
import {
  OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
  type OutboundEmailPayloadEncryptor,
} from '../../../../outbound-email/application/ports/outbound-email-payload-encryptor.port.js';

import {
  ForgotPasswordCommand,
  ForgotPasswordResult,
} from './forgot-password.command.js';

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler implements ICommandHandler<ForgotPasswordCommand> {
  constructor(
    @Inject(CLOCK)
    private readonly clock: Clock,
    @Inject(SECURE_TOKEN_FACTORY)
    private readonly tokenFactory: SecureTokenFactory,
    @Inject(PASSWORD_RESET_REQUEST_STORE)
    private readonly requestStore: PasswordResetRequestStore,
    @Inject(OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR)
    private readonly encryptor: OutboundEmailPayloadEncryptor,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<ForgotPasswordResult> {
    const now = this.clock.now();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'PASSWORD_RESET_TOKEN_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // 1. Generate a cryptographically secure token
    const token = this.tokenFactory.create();

    // 2. Build the payload (Frontend URL with the raw token)
    const baseUrl =
      this.configService.get<string>('API_PUBLIC_URL') ||
      'http://localhost:5173';

    const resetUrl = `${baseUrl}/reset-password?token=${token.rawToken}&email=${encodeURIComponent(command.email)}`;

    const payload = JSON.stringify({ resetUrl });

    // 3. Encrypt the payload so it is secure at rest in the Outbox
    const encryptedPayload = this.encryptor.encrypt(payload);

    // 4. Delegate to the store.
    // The store internally checks if the user exists and is eligible within a row-locking transaction.
    await this.requestStore.createPasswordResetRequest({
      email: command.email,
      tokenHash: token.tokenHash,
      expiresAt,
      now,
      encryptedPayload,
    });

    // 5. Zero Account Enumeration Response
    return {
      message:
        'If that email address is in our database, we will send you an email to reset your password.',
    };
  }
}
