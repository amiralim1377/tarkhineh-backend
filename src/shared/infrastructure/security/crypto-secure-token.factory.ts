import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import type {
  IssuedSecureToken,
  SecureTokenFactory,
  SecureTokenOptions,
} from '../../application/ports/secure-token-factory.port.js';

const DEFAULT_TOKEN_BYTE_LENGTH = 32;
const MIN_TOKEN_BYTE_LENGTH = 32;
const MAX_TOKEN_BYTE_LENGTH = 128;

@Injectable()
export class CryptoSecureTokenFactory implements SecureTokenFactory {
  create(options: SecureTokenOptions = {}): IssuedSecureToken {
    const byteLength = options.byteLength ?? DEFAULT_TOKEN_BYTE_LENGTH;

    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < MIN_TOKEN_BYTE_LENGTH ||
      byteLength > MAX_TOKEN_BYTE_LENGTH
    ) {
      throw new RangeError(
        `Token byte length must be between ${MIN_TOKEN_BYTE_LENGTH} and ${MAX_TOKEN_BYTE_LENGTH}.`,
      );
    }

    const rawToken = randomBytes(byteLength).toString('base64url');

    return {
      rawToken,
      tokenHash: this.hash(rawToken),
    };
  }

  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
