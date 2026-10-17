import type { IdentityUser } from '../entities/identity-user.js';

export const USER_AUTHENTICATION_REPOSITORY = Symbol(
  'USER_AUTHENTICATION_REPOSITORY',
);

export interface UserAuthenticationRepository {
  findByEmail(email: string): Promise<IdentityUser | null>;
}
