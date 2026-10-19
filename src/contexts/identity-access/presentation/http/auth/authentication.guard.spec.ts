import {
  InternalServerErrorException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { Auth } from './auth.decorator.js';
import { AuthenticationGuard } from './authentication.guard.js';
import type {
  AuthenticationStrategy,
  AuthenticatedPrincipal,
} from './authentication-strategy.js';
import { AuthType } from './auth-type.enum.js';

function createStrategy(
  authType: AuthType,
  result: AuthenticatedPrincipal | null,
): AuthenticationStrategy {
  return {
    authType,
    authenticate: vi.fn(async (_request: Request) => result),
  };
}

function createContext(
  controllerClass: Function,
  handler: Function,
  request: Record<string, unknown>,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthenticationGuard', () => {
  it('requires Bearer authentication when a route has no auth metadata', async () => {
    class ProtectedController {
      getProfile(): void {}
    }

    const strategy = createStrategy(AuthType.Bearer, {
      userId: 'user-123',
    });

    const request = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };

    const guard = new AuthenticationGuard(
      new Reflector(),
      [strategy],
    );

    const context = createContext(
      ProtectedController,
      ProtectedController.prototype.getProfile,
      request,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('user', { userId: 'user-123' });
    expect(strategy.authenticate).toHaveBeenCalledOnce();
  });

  it('allows a route explicitly marked as None', async () => {
    @Auth(AuthType.None)
    class PublicController {
      getPublicResource(): void {}
    }

    const strategy = createStrategy(AuthType.Bearer, null);

    const guard = new AuthenticationGuard(
      new Reflector(),
      [strategy],
    );

    const context = createContext(
      PublicController,
      PublicController.prototype.getPublicResource,
      { headers: {} },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(strategy.authenticate).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    class ProtectedController {
      getProfile(): void {}
    }

    const strategy = createStrategy(AuthType.Bearer, null);

    const guard = new AuthenticationGuard(
      new Reflector(),
      [strategy],
    );

    const context = createContext(
      ProtectedController,
      ProtectedController.prototype.getProfile,
      { headers: {} },
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses method metadata to override class metadata', async () => {
    @Auth(AuthType.None)
    class MixedController {
      @Auth(AuthType.Bearer)
      getProtectedResource(): void {}
    }

    const strategy = createStrategy(AuthType.Bearer, {
      userId: 'user-456',
    });

    const guard = new AuthenticationGuard(
      new Reflector(),
      [strategy],
    );

    const context = createContext(
      MixedController,
      MixedController.prototype.getProtectedResource,
      { headers: {} },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(strategy.authenticate).toHaveBeenCalledOnce();
  });

  it('tries the next strategy when the first strategy returns null', async () => {
    class MultiAuthController {
      @Auth(AuthType.Bearer, AuthType.Cookie)
      getProfile(): void {}
    }

    const bearerStrategy = createStrategy(AuthType.Bearer, null);
    const cookieStrategy = createStrategy(AuthType.Cookie, {
      userId: 'cookie-user',
    });

    const guard = new AuthenticationGuard(
      new Reflector(),
      [bearerStrategy, cookieStrategy],
    );

    const context = createContext(
      MultiAuthController,
      MultiAuthController.prototype.getProfile,
      { headers: {} },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(bearerStrategy.authenticate).toHaveBeenCalledOnce();
    expect(cookieStrategy.authenticate).toHaveBeenCalledOnce();
    expect(context.switchToHttp().getRequest()).toHaveProperty('user', {
      userId: 'cookie-user',
    });
  });

  it('fails closed when a declared strategy has not been registered', async () => {
    class CookieOnlyController {
      @Auth(AuthType.Cookie)
      getProfile(): void {}
    }

    const guard = new AuthenticationGuard(
      new Reflector(),
      [],
    );

    const context = createContext(
      CookieOnlyController,
      CookieOnlyController.prototype.getProfile,
      { headers: {} },
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects duplicate strategies during construction', () => {
    const first = createStrategy(AuthType.Bearer, null);
    const second = createStrategy(AuthType.Bearer, null);

    expect(
      () =>
        new AuthenticationGuard(
          new Reflector(),
          [first, second],
        ),
    ).toThrow('Duplicate authentication strategy: bearer');
  });
});
