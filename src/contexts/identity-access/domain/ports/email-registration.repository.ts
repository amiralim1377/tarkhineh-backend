import type { IdentityUser } from '../entities/identity-user.js';

export const EMAIL_REGISTRATION_REPOSITORY = Symbol(
  'EMAIL_REGISTRATION_REPOSITORY',
);

export interface CreatePendingEmailRegistration {
  readonly user: IdentityUser;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly encryptedPayload: string;
  readonly now: Date;
}

export interface EmailRegistrationRepository {
  createPendingRegistration(
    input: CreatePendingEmailRegistration,
  ): Promise<boolean>;
}
