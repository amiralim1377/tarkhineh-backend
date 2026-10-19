import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type {
  AccessTokenValidator,
  ValidatedAccessToken,
} from '../../application/ports/access-token-validator.port.js';

@Injectable()
export class JwtAccessTokenValidator implements AccessTokenValidator {
  constructor(private readonly jwtService: JwtService) {}

  async validate(token: string): Promise<ValidatedAccessToken | null> {
    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, {
        algorithms: ['HS256'],
      });

      if (
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        typeof payload.exp !== 'number' ||
        !Number.isFinite(payload.exp)
      ) {
        return null;
      }

      return {
        userId: payload.sub,
        expiresAt: payload.exp,
      };
    } catch (error: unknown) {
      // Invalid, expired, and not-yet-valid tokens are authentication failures.
      // Unexpected errors, such as server misconfiguration, must not be hidden.
      if (
        error instanceof Error &&
        [
          'JsonWebTokenError',
          'TokenExpiredError',
          'NotBeforeError',
        ].includes(error.name)
      ) {
        return null;
      }

      throw error;
    }
  }
}
