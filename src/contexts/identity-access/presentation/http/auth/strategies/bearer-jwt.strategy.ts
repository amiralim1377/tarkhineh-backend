import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import {
  ACCESS_TOKEN_VALIDATOR,
  type AccessTokenValidator,
} from '../../../../application/ports/access-token-validator.port.js';

import {
  ACCESS_TOKEN_IDENTITY_READER,
  type AccessTokenIdentityReader,
} from '../../../../application/ports/access-token-identity-reader.port.js';

import { AuthType } from '../contracts/auth-type.enum.js';
import type {
  AuthenticationStrategy,
  AuthenticatedPrincipal,
} from '../contracts/authentication-strategy.js';

@Injectable()
export class BearerJwtStrategy implements AuthenticationStrategy {
  readonly authType = AuthType.Bearer;

  constructor(
    @Inject(ACCESS_TOKEN_VALIDATOR)
    private readonly tokenValidator: AccessTokenValidator,

    @Inject(ACCESS_TOKEN_IDENTITY_READER)
    private readonly identityReader: AccessTokenIdentityReader,
  ) {}

  async authenticate(
    request: Request,
  ): Promise<AuthenticatedPrincipal | null> {
    const authorization = request.headers.authorization;

    if (typeof authorization !== 'string') {
      return null;
    }

    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());

    if (!match?.[1]) {
      return null;
    }

    const validatedToken = await this.tokenValidator.validate(match[1]);

    if (!validatedToken) {
      return null;
    }

    const user = await this.identityReader.findById(
      validatedToken.userId,
    );

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.emailVerifiedAt === null
    ) {
      return null;
    }

    return {
      userId: user.id,
    };
  }
}
