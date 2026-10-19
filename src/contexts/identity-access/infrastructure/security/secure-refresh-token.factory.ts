import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import type {
  GeneratedRefreshToken,
  RefreshTokenFactory,
} from '../../application/ports/refresh-token-factory.port.js';

@Injectable()
export class SecureRefreshTokenFactory implements RefreshTokenFactory {
  create(): GeneratedRefreshToken {
    const token = randomBytes(32).toString('base64url');

    return {
      token,
      tokenHash: this.hash(token),
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
