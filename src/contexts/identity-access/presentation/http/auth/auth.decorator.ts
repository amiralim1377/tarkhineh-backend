import { SetMetadata } from '@nestjs/common';

import { AuthType } from './auth-type.enum.js';

export const AUTH_TYPES_METADATA_KEY = 'identity-access:auth-types';

export function Auth(
  ...authTypes: AuthType[]
): MethodDecorator & ClassDecorator {
  if (authTypes.length === 0) {
    throw new TypeError(
      'Auth requires at least one AuthType. Use Auth(AuthType.None) for public routes.',
    );
  }

  const uniqueAuthTypes = [...new Set(authTypes)];

  if (
    uniqueAuthTypes.some(
      (authType) => !Object.values(AuthType).includes(authType),
    )
  ) {
    throw new TypeError('Auth received an unsupported authentication type.');
  }

  if (
    uniqueAuthTypes.includes(AuthType.None) &&
    uniqueAuthTypes.length > 1
  ) {
    throw new TypeError(
      'AuthType.None cannot be combined with other authentication types.',
    );
  }

  return SetMetadata(AUTH_TYPES_METADATA_KEY, uniqueAuthTypes);
}
