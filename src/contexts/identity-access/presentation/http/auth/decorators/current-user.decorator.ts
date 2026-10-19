import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedPrincipal } from '../contracts/authentication-strategy.js';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedPrincipal;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    return request.user;
  },
);
