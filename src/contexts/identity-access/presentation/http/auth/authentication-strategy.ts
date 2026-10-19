import type { Request } from 'express';

import type { AuthType } from './auth-type.enum.js';

export interface AuthenticatedPrincipal {
  readonly userId: string;
}

export interface AuthenticationStrategy {
  readonly authType: AuthType;

  authenticate(
    request: Request,
  ): Promise<AuthenticatedPrincipal | null>;
}
