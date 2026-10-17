import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  EmailVerificationToken,
  EmailVerificationTokenFactory,
} from '../../application/ports/email-verification-token-factory.port.js';

@Injectable()
export class SecureEmailVerificationTokenFactory
  implements EmailVerificationTokenFactory
{
  constructor(private readonly configService: ConfigService) {}

  create(): EmailVerificationToken {
    const configuredTtl = this.configService.get<string>(
      'EMAIL_VERIFICATION_TTL_SECONDS',
    );

    const ttlSeconds = Number(configuredTtl ?? '1800');

    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(
        'EMAIL_VERIFICATION_TTL_SECONDS must be a positive integer.',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256')
      .update(rawToken)
      .digest('hex');

    return {
      rawToken,
      tokenHash,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }
}
