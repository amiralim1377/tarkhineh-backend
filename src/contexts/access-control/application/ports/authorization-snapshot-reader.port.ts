import type { AuthorizationSnapshot } from '../../domain/authorization/permission-evaluator.js';

export const AUTHORIZATION_SNAPSHOT_READER = Symbol(
  'AUTHORIZATION_SNAPSHOT_READER',
);

export interface LoadAuthorizationSnapshotInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly branchId?: string;
}

/**
 * Loads a consistent authorization snapshot for one user and tenant context.
 * The Infrastructure adapter is responsible for persistence and mapping.
 */
export interface AuthorizationDelegationSnapshots {
  /** Snapshot without a Branch target, used for Organization permissions. */
  readonly organizationSnapshot: AuthorizationSnapshot;

  /** Exactly one snapshot for every ACTIVE Branch in the Organization. */
  readonly activeBranchSnapshots: readonly AuthorizationSnapshot[];
}

export interface AuthorizationSnapshotReader {
  loadSnapshot(
    input: LoadAuthorizationSnapshotInput,
  ): Promise<AuthorizationSnapshot>;

  /**
   * Loads the Organization snapshot and all active Branch snapshots from one
   * consistent persistence view.
   */
  loadDelegationSnapshots(
    input: Omit<LoadAuthorizationSnapshotInput, 'branchId'>,
  ): Promise<AuthorizationDelegationSnapshots>;
}
