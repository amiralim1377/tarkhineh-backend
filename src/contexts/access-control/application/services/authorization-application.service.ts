import { Inject, Injectable } from '@nestjs/common';
import {
  PERMISSION_DEFINITIONS,
  PERMISSION_TARGET_SCOPE,
  type PermissionCode,
} from '../../domain/permissions/permission-catalog.js';
import { isKnownPermissionCode } from '../../domain/rules/role-permission-scope.rule.js';
import {
  ROLE_ASSIGNMENT_SCOPE,
  type RoleAssignmentScope,
} from '../../domain/roles/role.types.js';
import { AuthorizationDecision } from '../../domain/authorization/authorization-decision.js';
import {
  PermissionEvaluator,
  type AuthorizationSnapshot,
} from '../../domain/authorization/permission-evaluator.js';
import type { CheckPermissionInput } from '../../domain/authorization/authorization.types.js';
import {
  AUTHORIZATION_SNAPSHOT_READER,
  type AuthorizationSnapshotReader,
} from '../ports/authorization-snapshot-reader.port.js';

export interface EffectiveAuthorizationContextInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly branchId?: string;
}

export interface EffectiveAuthorizationContext {
  readonly snapshot: AuthorizationSnapshot;
  readonly permissionCodes: readonly PermissionCode[];
}

const EMPTY_SNAPSHOT: AuthorizationSnapshot = {
  organization: null,
  organizationMembership: null,
  branch: null,
  branchMemberships: [],
  roles: [],
  roleAssignments: [],
  permissionOverrides: [],
};

/**
 * Application-level orchestration for permission checks and effective grants.
 *
 * This service deliberately knows only the snapshot reader Port and Domain
 * authorization policies. It does not depend on persistence implementations.
 */
@Injectable()
export class AuthorizationApplicationService {
  private readonly evaluator = new PermissionEvaluator();

  constructor(
    @Inject(AUTHORIZATION_SNAPSHOT_READER)
    private readonly snapshotReader: AuthorizationSnapshotReader,
  ) {}

  async checkPermission(
    input: CheckPermissionInput,
    snapshotReader: AuthorizationSnapshotReader = this.snapshotReader,
  ): Promise<AuthorizationDecision> {
    const userId = input.userId.trim();
    const organizationId = input.organizationId.trim();
    const branchId = input.branchId?.trim() || undefined;

    const request: CheckPermissionInput = {
      userId,
      organizationId,
      permissionCode: input.permissionCode,
      ...(branchId === undefined ? {} : { branchId }),
    };

    // Fail closed without querying persistence for malformed requests.
    if (
      !userId ||
      !organizationId ||
      !isKnownPermissionCode(input.permissionCode) ||
      (input.permissionCode &&
        PERMISSION_DEFINITIONS.some(
          (definition) =>
            definition.code === input.permissionCode &&
            definition.targetScope === PERMISSION_TARGET_SCOPE.BRANCH,
        ) &&
        branchId === undefined)
    ) {
      return this.evaluator.evaluate({
        request,
        snapshot: EMPTY_SNAPSHOT,
      });
    }

    const snapshot = await snapshotReader.loadSnapshot({
      userId,
      organizationId,
      ...(branchId === undefined ? {} : { branchId }),
    });

    return this.evaluator.evaluate({ request, snapshot });
  }

  /**
   * Returns all permissions effective for the supplied context.
   *
   * Without a Branch ID, only Organization-target permissions can be
   * established. With a Branch ID, both Organization and Branch permissions
   * are evaluated against the same loaded snapshot.
   *
   * The snapshot is also returned internally so mutation use cases can reuse
   * the exact context from which actor permissions were derived.
   */
  async getEffectiveAuthorizationContext(
    input: EffectiveAuthorizationContextInput,
    snapshotReader: AuthorizationSnapshotReader = this.snapshotReader,
  ): Promise<EffectiveAuthorizationContext> {
    const userId = input.userId.trim();
    const organizationId = input.organizationId.trim();
    const branchId = input.branchId?.trim() || undefined;
    const branchContextWasProvided = input.branchId !== undefined;

    if (
      !userId ||
      !organizationId ||
      (branchContextWasProvided && branchId === undefined)
    ) {
      return {
        snapshot: EMPTY_SNAPSHOT,
        permissionCodes: [],
      };
    }

    const snapshot = await snapshotReader.loadSnapshot({
      userId,
      organizationId,
      ...(branchId === undefined ? {} : { branchId }),
    });

    const permissionCodes = PERMISSION_DEFINITIONS.filter((definition) => {
      if (
        definition.targetScope === PERMISSION_TARGET_SCOPE.BRANCH &&
        branchId === undefined
      ) {
        return false;
      }

      const request: CheckPermissionInput = {
        userId,
        organizationId,
        permissionCode: definition.code,
        ...(branchId === undefined ? {} : { branchId }),
      };

      return this.evaluator.evaluate({ request, snapshot }).isAllowed();
    }).map((definition) => definition.code);

    return {
      snapshot,
      permissionCodes: Object.freeze(permissionCodes),
    };
  }

  /**
   * Returns permissions an actor can safely delegate into an
   * Organization-defined Role.
   *
   * Organization permissions are evaluated against the Organization snapshot.
   * For Organization-assignment Roles, Branch permissions must be effective
   * in every active Branch because the Role applies across all Branches.
   * For Branch-assignment Roles, a Branch permission may be included when it
   * is effective in at least one active Branch. The later assignment workflow
   * must still validate delegation against its exact target Branch.
   *
   * With no active Branches, no Branch permission is assumed delegable.
   */
  async getEffectiveDelegationPermissionCodes(
    input: {
      readonly userId: string;
      readonly organizationId: string;
      readonly assignmentScope?: RoleAssignmentScope;
    },
    snapshotReader: AuthorizationSnapshotReader = this.snapshotReader,
  ): Promise<readonly PermissionCode[]> {
    const userId = input.userId.trim();
    const organizationId = input.organizationId.trim();

    if (!userId || !organizationId) {
      return [];
    }

    const snapshots = await snapshotReader.loadDelegationSnapshots({
      userId,
      organizationId,
    });

    const organizationPermissionCodes = PERMISSION_DEFINITIONS.filter(
      (definition) =>
        definition.targetScope === PERMISSION_TARGET_SCOPE.ORGANIZATION &&
        this.evaluator
          .evaluate({
            request: {
              userId,
              organizationId,
              permissionCode: definition.code,
            },
            snapshot: snapshots.organizationSnapshot,
          })
          .isAllowed(),
    ).map((definition) => definition.code);

    const branchPermissionCodes =
      snapshots.activeBranchSnapshots.length === 0
        ? []
        : PERMISSION_DEFINITIONS.filter((definition) => {
            if (definition.targetScope !== PERMISSION_TARGET_SCOPE.BRANCH) {
              return false;
            }

            const isEffectiveInSnapshot = (
              snapshot: AuthorizationSnapshot,
            ): boolean => {
              const branchId = snapshot.branch?.id;

              if (!branchId) {
                return false;
              }

              return this.evaluator
                .evaluate({
                  request: {
                    userId,
                    organizationId,
                    permissionCode: definition.code,
                    branchId,
                  },
                  snapshot,
                })
                .isAllowed();
            };

            return input.assignmentScope === ROLE_ASSIGNMENT_SCOPE.BRANCH
              ? snapshots.activeBranchSnapshots.some(isEffectiveInSnapshot)
              : snapshots.activeBranchSnapshots.every(isEffectiveInSnapshot);
          }).map((definition) => definition.code);

    return Object.freeze([
      ...organizationPermissionCodes,
      ...branchPermissionCodes,
    ]);
  }
}
