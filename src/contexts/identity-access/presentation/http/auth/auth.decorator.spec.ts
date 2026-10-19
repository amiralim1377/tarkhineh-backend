import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import {
  Auth,
  AUTH_TYPES_METADATA_KEY,
} from './auth.decorator.js';
import { AuthType } from './auth-type.enum.js';

describe('Auth decorator', () => {
  it('stores multiple authentication types as metadata', () => {
    class TestController {
      @Auth(AuthType.Bearer, AuthType.Cookie)
      protectedRoute(): void {}
    }

    const handler = TestController.prototype.protectedRoute;

    expect(
      Reflect.getMetadata(AUTH_TYPES_METADATA_KEY, handler),
    ).toEqual([AuthType.Bearer, AuthType.Cookie]);
  });

  it('supports explicitly public routes', () => {
    @Auth(AuthType.None)
    class PublicController {}

    expect(
      Reflect.getMetadata(AUTH_TYPES_METADATA_KEY, PublicController),
    ).toEqual([AuthType.None]);
  });

  it('rejects an empty authentication declaration', () => {
    expect(() => Auth()).toThrow(
      'Auth requires at least one AuthType',
    );
  });

  it('rejects combining None with an authentication strategy', () => {
    expect(() => Auth(AuthType.None, AuthType.Bearer)).toThrow(
      'AuthType.None cannot be combined',
    );
  });
});
