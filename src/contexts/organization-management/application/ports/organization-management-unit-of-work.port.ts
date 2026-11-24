import type { MembershipInvitationPort } from './membership-invitation.port.js';
import type { MembershipInvitationEmailPort } from './membership-invitation-email.port.js';

export const ORGANIZATION_MANAGEMENT_UNIT_OF_WORK = Symbol(
  'ORGANIZATION_MANAGEMENT_UNIT_OF_WORK',
);

/**
 * Transaction-bound application ports.
 *
 * All ports exposed by this context must participate in the same
 * underlying database transaction.
 *
 * The email port must only enqueue an email message in the database.
 * It must never perform actual external email delivery.
 */
export interface OrganizationManagementUnitOfWorkContext {
  readonly membershipInvitationRepository: MembershipInvitationPort;
  readonly membershipInvitationEmail: MembershipInvitationEmailPort;
}

/**
 * Executes an Organization Management operation atomically.
 *
 * Infrastructure is responsible for:
 * - Binding all supplied ports to the same transaction.
 * - Committing when the operation succeeds.
 * - Rolling back when the operation fails.
 * - Preserving and propagating application errors.
 *
 * The operation may be retried by the underlying transaction infrastructure.
 * Therefore, callbacks must not perform external side effects.
 */
export interface OrganizationManagementUnitOfWork {
  execute<T>(
    operation: (context: OrganizationManagementUnitOfWorkContext) => Promise<T>,
  ): Promise<T>;
}
