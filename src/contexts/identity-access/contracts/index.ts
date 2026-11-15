export const IDENTITY_ACCESS_USER_LOOKUP = Symbol(
  'IDENTITY_ACCESS_USER_LOOKUP',
);

export interface IdentityAccessUserLookup {
  existsById(userId: string): Promise<boolean>;
}
