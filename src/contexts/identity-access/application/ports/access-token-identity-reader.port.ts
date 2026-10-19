import type { IdentityUserStatus } from '../../domain/entities/identity-user.js';

export const ACCESS_TOKEN_IDENTITY_READER = Symbol(
  'ACCESS_TOKEN_IDENTITY_READER',
);

export interface AccessTokenIdentityRecord {
  id: string;
  status: IdentityUserStatus;
  emailVerifiedAt: Date | null;
}

export interface AccessTokenIdentityReader {
  findById(userId: string): Promise<AccessTokenIdentityRecord | null>;
}
