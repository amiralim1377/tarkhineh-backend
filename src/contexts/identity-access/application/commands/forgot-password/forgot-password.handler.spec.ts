import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { ConfigService } from '@nestjs/config';

import { ForgotPasswordHandler } from './forgot-password.handler.js';
import { ForgotPasswordCommand } from './forgot-password.command.js';

import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import type { SecureTokenFactory } from '../../../../../shared/application/ports/secure-token-factory.port.js';
import type { PasswordResetRequestStore } from '../../ports/password-reset-request-store.port.js';
import type { OutboundEmailPayloadEncryptor } from '../../../../outbound-email/application/ports/outbound-email-payload-encryptor.port.js';

describe('ForgotPasswordHandler', () => {
  let clock: Mocked<Clock>;
  let tokenFactory: Mocked<SecureTokenFactory>;
  let requestStore: Mocked<PasswordResetRequestStore>;
  let encryptor: Mocked<OutboundEmailPayloadEncryptor>;
  let configService: Mocked<ConfigService>;
  let handler: ForgotPasswordHandler;

  const FIXED_NOW = new Date('2026-10-21T12:00:00.000Z');
  const TTL_SECONDS = 900; // 15 minutes

  beforeEach(() => {
    clock = { now: vi.fn().mockReturnValue(FIXED_NOW) };

    tokenFactory = {
      create: vi.fn().mockReturnValue({
        rawToken: 'secure-raw-token-123',
        tokenHash: 'hashed-token-456',
      }),
      hash: vi.fn(),
    };

    requestStore = {
      createPasswordResetRequest: vi.fn().mockResolvedValue(undefined),
    };

    encryptor = {
      encrypt: vi.fn().mockReturnValue('encrypted-payload-string'),
      decrypt: vi.fn(),
    };

    configService = {
      getOrThrow: vi.fn().mockImplementation((key: string) => {
        if (key === 'PASSWORD_RESET_TOKEN_TTL_SECONDS') return TTL_SECONDS;
        throw new Error(`Unexpected config key: ${key}`);
      }),
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'API_PUBLIC_URL') return 'https://tarkhineh.com';
        return undefined;
      }),
    } as unknown as Mocked<ConfigService>;

    handler = new ForgotPasswordHandler(
      clock,
      tokenFactory,
      requestStore,
      encryptor,
      configService,
    );
  });

  it('should orchestrate password reset request and return zero-enumeration message', async () => {
    const email = 'user@example.com';
    const command = new ForgotPasswordCommand(email);

    const result = await handler.execute(command);

    // 1. Check if token was created
    expect(tokenFactory.create).toHaveBeenCalledOnce();

    // 2. Check if payload was encrypted with correct reset URL
    const expectedPayload = JSON.stringify({
      resetUrl: `https://tarkhineh.com/reset-password?token=secure-raw-token-123&email=${encodeURIComponent(email)}`,
    });
    expect(encryptor.encrypt).toHaveBeenCalledWith(expectedPayload);

    // 3. Check if store was called with correct data
    const expectedExpiresAt = new Date(
      FIXED_NOW.getTime() + TTL_SECONDS * 1000,
    );
    expect(requestStore.createPasswordResetRequest).toHaveBeenCalledWith({
      email,
      tokenHash: 'hashed-token-456',
      expiresAt: expectedExpiresAt,
      now: FIXED_NOW,
      encryptedPayload: 'encrypted-payload-string',
    });

    // 4. Check zero-enumeration message
    expect(result.message).toBe(
      'If that email address is in our database, we will send you an email to reset your password.',
    );
  });
});
