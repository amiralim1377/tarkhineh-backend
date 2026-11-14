import type { IdentityUserStatus } from '../domain/types/identity-user-status.js';

export type IdentityAccessUserStatus = IdentityUserStatus;

export const IDENTITY_ACCESS_USER_LOOKUP = Symbol(
  'IDENTITY_ACCESS_USER_LOOKUP',
);

export interface IdentityAccessUserLookup {
  findStatusById(userId: string): Promise<IdentityAccessUserStatus | null>;
}
