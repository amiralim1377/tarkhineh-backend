import type { AuthorizationSnapshotReader } from './authorization-snapshot-reader.port.js';
import type { PermissionOverrideRepository } from './permission-override.repository.js';
import type { RoleAssignmentRepository } from './role-assignment.repository.js';
import type { RoleRepository } from './role.repository.js';

export const ACCESS_CONTROL_UNIT_OF_WORK = Symbol(
  'ACCESS_CONTROL_UNIT_OF_WORK',
);

/**
 * Transaction-bound Application ports.
 *
 * The Unit of Work owns the transaction lifecycle.
 * Every port exposed here is transaction-bound and must use the same
 * underlying transaction client. No supplied adapter may open, commit,
 * or roll back an independent or nested transaction.
 * Authorization reads and subsequent mutations must observe a consistent
 * persistence view.
 */
export interface AccessControlUnitOfWorkContext {
  readonly authorizationSnapshotReader: AuthorizationSnapshotReader;
  readonly roleRepository: RoleRepository;
  readonly roleAssignmentRepository: RoleAssignmentRepository;
  readonly permissionOverrideRepository: PermissionOverrideRepository;
}

/**
 * Executes an Access Control operation atomically.
 *
 * Infrastructure must:
 * - Bind every supplied port to the same database transaction.
 * - Provide consistent authorization reads for the complete operation.
 * - Commit when the callback resolves successfully.
 * - Roll back when the callback throws.
 * - Preserve and propagate the original application error.
 *
 * The implementation must protect check-then-write operations against
 * concurrent authorization changes, using an appropriate isolation or
 * locking strategy. Database uniqueness constraints remain authoritative.
 *
 * Callbacks must not perform external side effects. An Infrastructure
 * implementation may retry a transaction after a serialization conflict.
 */
export interface AccessControlUnitOfWork {
  execute<T>(
    operation: (
      context: AccessControlUnitOfWorkContext,
    ) => Promise<T>,
  ): Promise<T>;
}
