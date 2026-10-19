import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  AUTHENTICATION_STRATEGIES,
  type AuthenticationStrategy,
  type AuthenticatedPrincipal,
} from './authentication-strategy.js';
import { AuthType } from './auth-type.enum.js';
import { AUTH_TYPES_METADATA_KEY } from './auth.decorator.js';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedPrincipal;
};

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly strategiesByType: ReadonlyMap<
    AuthType,
    AuthenticationStrategy
  >;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHENTICATION_STRATEGIES)
    strategies: readonly AuthenticationStrategy[],
  ) {
    const strategiesByType = new Map<
      AuthType,
      AuthenticationStrategy
    >();

    for (const strategy of strategies) {
      if (strategiesByType.has(strategy.authType)) {
        throw new Error(
          `Duplicate authentication strategy: ${strategy.authType}`,
        );
      }

      strategiesByType.set(strategy.authType, strategy);
    }

    this.strategiesByType = strategiesByType;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authTypes = this.reflector.getAllAndOverride<AuthType[]>(
      AUTH_TYPES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Unannotated routes are protected by default.
    const requiredTypes = authTypes ?? [AuthType.Bearer];

    if (requiredTypes.length === 0) {
      throw new InternalServerErrorException();
    }

    if (requiredTypes.includes(AuthType.None)) {
      if (requiredTypes.length !== 1) {
        throw new InternalServerErrorException();
      }

      return true;
    }

    // Fail closed if any declared strategy has not been registered.
    const strategies = requiredTypes.map((authType) => {
      const strategy = this.strategiesByType.get(authType);

      if (!strategy) {
        throw new InternalServerErrorException();
      }

      return strategy;
    });

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    for (const strategy of strategies) {
      const principal = await strategy.authenticate(request);

      if (principal) {
        request.user = principal;
        return true;
      }
    }

    throw new UnauthorizedException();
  }
}
