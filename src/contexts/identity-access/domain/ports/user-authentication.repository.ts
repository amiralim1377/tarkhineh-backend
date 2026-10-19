import type { IdentityUser } from '../entities/identity-user.js';

export const USER_AUTHENTICATION_REPOSITORY = Symbol(
  'USER_AUTHENTICATION_REPOSITORY',
);

export interface ChangePasswordInput {
  readonly userId: string;
  readonly currentPasswordHash: string;
  readonly newPasswordHash: string;
}

export interface UserAuthenticationRepository {
  findByEmail(email: string): Promise<IdentityUser | null>;
  findById(userId: string): Promise<IdentityUser | null>;
  changePassword(input: ChangePasswordInput): Promise<boolean>;
}
