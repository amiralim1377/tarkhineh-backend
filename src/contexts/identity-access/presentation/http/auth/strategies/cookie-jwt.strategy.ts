import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ACCESS_TOKEN_IDENTITY_READER } from '../../../../application/ports/access-token-identity-reader.port.js';
import type { AccessTokenIdentityReader } from '../../../../application/ports/access-token-identity-reader.port.js';
import { ACCESS_TOKEN_VALIDATOR } from '../../../../application/ports/access-token-validator.port.js';
import type { AccessTokenValidator } from '../../../../application/ports/access-token-validator.port.js';

import type {
  AuthenticatedPrincipal,
  AuthenticationStrategy,
} from '../contracts/authentication-strategy.js';
import { AuthType } from '../contracts/auth-type.enum.js';

export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';

function extractAccessToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  let found = false;
  let token: string | null = null;

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();

    if (name !== ACCESS_TOKEN_COOKIE_NAME) {
      continue;
    }

    // Duplicate access-token cookies are ambiguous; reject them.
    if (found) {
      return null;
    }
    found = true;

    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      return null;
    }

    try {
      token = decodeURIComponent(rawValue);
    } catch {
      return null;
    }

    if (!token) {
      return null;
    }
  }

  return token;
}

@Injectable()
export class CookieJwtStrategy implements AuthenticationStrategy {
  readonly authType = AuthType.Cookie;

  constructor(
    @Inject(ACCESS_TOKEN_VALIDATOR)
    private readonly tokenValidator: AccessTokenValidator,
    @Inject(ACCESS_TOKEN_IDENTITY_READER)
    private readonly identityReader: AccessTokenIdentityReader,
  ) {}

  async authenticate(
    request: Request,
  ): Promise<AuthenticatedPrincipal | null> {
    const token = extractAccessToken(request.headers.cookie);

    if (!token) {
      return null;
    }

    const validatedToken = await this.tokenValidator.validate(token);

    if (!validatedToken) {
      return null;
    }

    const identity = await this.identityReader.findById(
      validatedToken.userId,
    );

    if (
      !identity ||
      identity.status !== 'ACTIVE' ||
      identity.emailVerifiedAt === null
    ) {
      return null;
    }

    return { userId: identity.id };
  }
}
