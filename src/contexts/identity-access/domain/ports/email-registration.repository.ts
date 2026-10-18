export const EMAIL_REGISTRATION_REPOSITORY = Symbol(
  'EMAIL_REGISTRATION_REPOSITORY',
);

export interface CreatePendingEmailRegistration {
  email: string;
  passwordHash: string;
  displayName: string | null;
  tokenHash: string;
  expiresAt: Date;
  encryptedToken: string;
}

export interface EmailRegistrationRepository {
  createPendingRegistration(
    input: CreatePendingEmailRegistration,
  ): Promise<boolean>;
}
