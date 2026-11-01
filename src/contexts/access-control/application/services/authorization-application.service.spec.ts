import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationSnapshot } from '../../domain/authorization/permission-evaluator.js';
import { Role } from '../../domain/roles/role.js';
import { RoleAssignment } from '../../domain/role-assignments/role-assignment.js';
import type { AuthorizationSnapshotReader } from '../ports/authorization-snapshot-reader.port.js';
import { AuthorizationApplicationService } from './authorization-application.service.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');

function createRole(): Role {
  return Role.create({
    id: 'role-organization-reader',
    code: 'TEST_ORGANIZATION_READER',
    name: 'Test Organization Reader',
    description: null,
    definitionScope: 'ORGANIZATION',
    assignmentScope: 'ORGANIZATION',
    organizationId: 'org-1',
    isAssignable: true,
    status: 'ACTIVE',
    permissionCodes: ['organization.read', 'branch.dashboard.read'],
  });
}

function createSnapshot(): AuthorizationSnapshot {
  const role = createRole();

  const assignment = RoleAssignment.create({
    id: 'assignment-1',
    role,
    organizationMembership: {
      id: 'organization-membership-1',
      organizationId: 'org-1',
    },
    createdAt: NOW,
  });

  return {
    organization: {
      id: 'org-1',
      status: 'ACTIVE',
    },
    organizationMembership: {
      id: 'organization-membership-1',
      userId: 'user-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
    },
    branch: {
      id: 'branch-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
    },
    branchMemberships: [],
    roles: [role],
    roleAssignments: [assignment],
    permissionOverrides: [],
  };
}

function createSut() {
  const snapshot = createSnapshot();
  const loadSnapshot = vi.fn().mockResolvedValue(snapshot);
  const loadDelegationSnapshots = vi.fn().mockResolvedValue({
    organizationSnapshot: snapshot,
    activeBranchSnapshots: [snapshot],
  });

  const reader = {
    loadSnapshot,
    loadDelegationSnapshots,
  } as AuthorizationSnapshotReader;

  const service = new AuthorizationApplicationService(reader);

  return {
    service,
    snapshot,
    loadSnapshot,
    loadDelegationSnapshots,
  };
}

describe('AuthorizationApplicationService', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  describe('checkPermission', () => {
    it('checks a permission against a loaded authorization snapshot', async () => {
      const decision = await sut.service.checkPermission({
        userId: 'user-1',
        organizationId: 'org-1',
        permissionCode: 'branch.dashboard.read',
        branchId: 'branch-1',
      });

      expect(decision.isAllowed()).toBe(true);
      expect(sut.loadSnapshot).toHaveBeenCalledOnce();
      expect(sut.loadSnapshot).toHaveBeenCalledWith({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });
    });

    it('denies an unknown permission without loading a snapshot', async () => {
      const decision = await sut.service.checkPermission({
        userId: 'user-1',
        organizationId: 'org-1',
        permissionCode: 'unknown.permission',
      });

      expect(decision.isDenied()).toBe(true);
      expect(decision.reasonCode).toBe('PERMISSION_UNKNOWN');
      expect(sut.loadSnapshot).not.toHaveBeenCalled();
    });

    it('denies an empty actor ID without loading a snapshot', async () => {
      const decision = await sut.service.checkPermission({
        userId: ' ',
        organizationId: 'org-1',
        permissionCode: 'organization.read',
      });

      expect(decision.isDenied()).toBe(true);
      expect(decision.reasonCode).toBe('USER_ID_REQUIRED');
      expect(sut.loadSnapshot).not.toHaveBeenCalled();
    });

    it('requires a Branch ID for a Branch-target permission without loading a snapshot', async () => {
      const decision = await sut.service.checkPermission({
        userId: 'user-1',
        organizationId: 'org-1',
        permissionCode: 'branch.dashboard.read',
      });

      expect(decision.isDenied()).toBe(true);
      expect(decision.reasonCode).toBe('BRANCH_REQUIRED');
      expect(sut.loadSnapshot).not.toHaveBeenCalled();
    });

    it('propagates snapshot reader failures', async () => {
      sut.loadSnapshot.mockRejectedValueOnce(
        new Error('Authorization data unavailable'),
      );

      await expect(
        sut.service.checkPermission({
          userId: 'user-1',
          organizationId: 'org-1',
          permissionCode: 'organization.read',
        }),
      ).rejects.toThrow('Authorization data unavailable');
    });
  });

  describe('getEffectiveAuthorizationContext', () => {
    it('returns only Organization-target permissions without a Branch context', async () => {
      const result = await sut.service.getEffectiveAuthorizationContext({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(result.permissionCodes).toEqual(['organization.read']);
      expect(result.snapshot).toBe(sut.snapshot);

      expect(sut.loadSnapshot).toHaveBeenCalledWith({
        userId: 'user-1',
        organizationId: 'org-1',
      });
    });

    it('includes inherited Branch permissions when a Branch context is supplied', async () => {
      const result = await sut.service.getEffectiveAuthorizationContext({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      expect(result.permissionCodes).toEqual([
        'organization.read',
        'branch.dashboard.read',
      ]);

      expect(sut.loadSnapshot).toHaveBeenCalledWith({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });
    });

    it('returns no permissions for an empty user ID without loading a snapshot', async () => {
      const result = await sut.service.getEffectiveAuthorizationContext({
        userId: ' ',
        organizationId: 'org-1',
      });

      expect(result.permissionCodes).toEqual([]);
      expect(result.snapshot.organization).toBeNull();
      expect(sut.loadSnapshot).not.toHaveBeenCalled();
    });

    it('fails closed when a supplied Branch ID is blank instead of downgrading to Organization context', async () => {
      const result = await sut.service.getEffectiveAuthorizationContext({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: '   ',
      });

      expect(result.permissionCodes).toEqual([]);
      expect(result.snapshot.organization).toBeNull();
      expect(sut.loadSnapshot).not.toHaveBeenCalled();
    });

    it('returns no permissions when the snapshot contains an inactive Organization', async () => {
      const inactiveSnapshot: AuthorizationSnapshot = {
        ...sut.snapshot,
        organization: {
          id: 'org-1',
          status: 'SUSPENDED',
        },
      };

      sut.loadSnapshot.mockResolvedValueOnce(inactiveSnapshot);

      const result = await sut.service.getEffectiveAuthorizationContext({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      expect(result.permissionCodes).toEqual([]);
    });

    it('does not expose a mutable permission-code array', async () => {
      const result = await sut.service.getEffectiveAuthorizationContext({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(Object.isFrozen(result.permissionCodes)).toBe(true);
    });
  });

  describe('getEffectiveDelegationPermissionCodes', () => {
    it('includes a Branch permission only when effective across every active Branch', async () => {
      const secondBranchSnapshot = createSnapshot();
      secondBranchSnapshot.roles[0].replacePermissionCodes([
        'organization.read',
      ]);

      sut.loadDelegationSnapshots.mockResolvedValueOnce({
        organizationSnapshot: sut.snapshot,
        activeBranchSnapshots: [sut.snapshot, secondBranchSnapshot],
      });

      const permissions =
        await sut.service.getEffectiveDelegationPermissionCodes({
          userId: 'user-1',
          organizationId: 'org-1',
        });

      expect(permissions).toEqual(['organization.read']);
    });

    it('includes inherited Branch permissions when every active Branch grants them', async () => {
      const secondBranchSnapshot = {
        ...createSnapshot(),
        branch: {
          id: 'branch-2',
          organizationId: 'org-1',
          status: 'ACTIVE' as const,
        },
      };

      sut.loadDelegationSnapshots.mockResolvedValueOnce({
        organizationSnapshot: sut.snapshot,
        activeBranchSnapshots: [sut.snapshot, secondBranchSnapshot],
      });

      const permissions =
        await sut.service.getEffectiveDelegationPermissionCodes({
          userId: 'user-1',
          organizationId: 'org-1',
        });

      expect(permissions).toEqual([
        'organization.read',
        'branch.dashboard.read',
      ]);
    });

    it('uses the union of effective Branch permissions for Branch-assignment Roles', async () => {
      const secondBranchSnapshot = createSnapshot();
      secondBranchSnapshot.roles[0].replacePermissionCodes([
        'organization.read',
      ]);

      sut.loadDelegationSnapshots.mockResolvedValueOnce({
        organizationSnapshot: sut.snapshot,
        activeBranchSnapshots: [sut.snapshot, secondBranchSnapshot],
      });

      const permissions =
        await sut.service.getEffectiveDelegationPermissionCodes({
          userId: 'user-1',
          organizationId: 'org-1',
          assignmentScope: 'BRANCH',
        });

      expect(permissions).toContain('branch.dashboard.read');
      expect(permissions).toContain('organization.read');
    });

    it('does not assume Branch permissions when the Organization has no active Branches', async () => {
      sut.loadDelegationSnapshots.mockResolvedValueOnce({
        organizationSnapshot: sut.snapshot,
        activeBranchSnapshots: [],
      });

      const permissions =
        await sut.service.getEffectiveDelegationPermissionCodes({
          userId: 'user-1',
          organizationId: 'org-1',
        });

      expect(permissions).toEqual(['organization.read']);
    });

    it('does not load snapshots for an empty actor or Organization ID', async () => {
      const permissions =
        await sut.service.getEffectiveDelegationPermissionCodes({
          userId: ' ',
          organizationId: 'org-1',
        });

      expect(permissions).toEqual([]);
      expect(sut.loadDelegationSnapshots).not.toHaveBeenCalled();
    });
  });
});
