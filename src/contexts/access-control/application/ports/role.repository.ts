import type { Role } from '../../domain/roles/role.js';

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

/**
 * Access Control Role aggregate persistence contract.
 *
 * save() and update() must persist the Role and its complete Permission
 * relation set atomically. The Infrastructure adapter owns the transaction.
 */
export interface RoleRepository {
  existsByCode(organizationId: string, code: string): Promise<boolean>;

  /** Finds a System Role or an Organization Role owned by this Organization. */
  findAssignableById(
    organizationId: string,
    roleId: string,
  ): Promise<Role | null>;

  /** Finds only a Role owned by the supplied Organization. */
  findById(organizationId: string, roleId: string): Promise<Role | null>;
  save(role: Role): Promise<void>;
  update(role: Role): Promise<void>;
}
