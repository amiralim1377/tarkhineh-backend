import type { IdentityUser } from '../entities/identity-user.js';

export const EMAIL_REGISTRATION_REPOSITORY = Symbol(
  'EMAIL_REGISTRATION_REPOSITORY',
);

export interface CreatePendingEmailRegistration {
  user: IdentityUser;
  tokenHash: string;
  expiresAt: Date;
  encryptedToken: string;
}

export interface EmailRegistrationRepository {
  createPendingRegistration(
    input: CreatePendingEmailRegistration,
  ): Promise<boolean>;
}
