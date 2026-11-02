import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../../domain/roles/role.js';
import { InvalidRoleAssignmentError } from '../../../domain/errors/invalid-role-assignment.error.js';
import { RoleAssignment } from '../../../domain/role-assignments/role-assignment.js';
import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { RoleAssignmentAlreadyExistsError } from '../../errors/role-assignment-already-exists.error.js';
import { RoleAssignmentTargetNotFoundError } from '../../errors/role-assignment-target-not-found.error.js';
import { RoleNotFoundError } from '../../errors/role-not-found.error.js';
import type { AuthorizationSnapshotReader } from '../../ports/authorization-snapshot-reader.port.js';
import type {
  AccessControlUnitOfWork,
  AccessControlUnitOfWorkContext,
} from '../../ports/access-control-unit-of-work.port.js';
import type { PermissionOverrideRepository } from '../../ports/permission-override.repository.js';
import type { RoleAssignmentRepository } from '../../ports/role-assignment.repository.js';
import type { RoleRepository } from '../../ports/role.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { AssignRoleCommand } from './assign-role.command.js';
import { AssignRoleHandler } from './assign-role.handler.js';

const FIXED_TIME = new Date('2026-11-01T12:00:00.000Z');

function createOrganizationRole(
  overrides: {
    organizationId?: string;
    permissionCodes?: readonly string[];
    isAssignable?: boolean;
  } = {},
): Role {
  return Role.create({
    id: 'role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    definitionSource: 'ORGANIZATION_DEFINED',
    assignmentScope: 'ORGANIZATION',
    organizationId: overrides.organizationId ?? 'org-1',
    isAssignable: overrides.isAssignable ?? true,
    permissionCodes: overrides.permissionCodes ?? ['organization.read'],
  });
}

function createBranchRole(
  overrides: {
    organizationId?: string | null;
    permissionCodes?: readonly string[];
  } = {},
): Role {
  return Role.create({
    id: 'branch-role-1',
    code: 'BRANCH_MANAGER_CUSTOM',
    name: 'Branch Manager Custom',
    definitionSource:
      overrides.organizationId === null ? 'SYSTEM' : 'ORGANIZATION_DEFINED',
    assignmentScope: 'BRANCH',
    organizationId:
      overrides.organizationId === null
        ? null
        : (overrides.organizationId ?? 'org-1'),
    isAssignable: true,
    permissionCodes: overrides.permissionCodes ?? ['branch.dashboard.read'],
  });
}

function createCommand(
  overrides: {
    actorUserId?: string;
    organizationId?: string;
    roleId?: string;
    target?: 'ORGANIZATION' | 'BRANCH' | 'NONE';
    organizationMembershipId?: string;
    branchMembershipId?: string;
    branchId?: string;
  } = {},
): AssignRoleCommand {
  const target = overrides.target ?? 'ORGANIZATION';

  const targetInput =
    target === 'ORGANIZATION'
      ? {
          organizationMembershipId:
            overrides.organizationMembershipId ?? 'membership-1',
        }
      : target === 'BRANCH'
        ? {
            branchMembershipId:
              overrides.branchMembershipId ?? 'branch-membership-1',
            branchId: overrides.branchId ?? 'branch-1',
          }
        : {};

  return new AssignRoleCommand(overrides.actorUserId ?? 'actor-1', {
    organizationId: overrides.organizationId ?? 'org-1',
    roleId: overrides.roleId ?? 'role-1',
    ...targetInput,
  });
}

function createSut(role: Role | null = createOrganizationRole()) {
  let transactionActive = false;

  const transactionReader = {
    loadSnapshot: vi.fn(),
    loadDelegationSnapshots: vi.fn(),
  } as AuthorizationSnapshotReader;

  const findAssignableById = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
    return role;
  });

  const findActiveOrganizationMembership = vi
    .fn()
    .mockImplementation(async () => {
      expect(transactionActive).toBe(true);

      return {
        id: 'membership-1',
        organizationId: 'org-1',
      };
    });

  const findActiveBranchMembership = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);

    return {
      id: 'branch-membership-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    };
  });

  const existsActiveForTarget = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
    return false;
  });

  const saveAssignment = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
  });

  const roles = {
    existsByCode: vi.fn(),
    findAssignableById,
    findById: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  } as RoleRepository;

  const assignments = {
    findActiveOrganizationMembership,
    findActiveBranchMembership,
    existsActiveForTarget,
    findByIdForRevocation: vi.fn(),
    save: saveAssignment,
    update: vi.fn(),
  } as RoleAssignmentRepository;

  const context: AccessControlUnitOfWorkContext = {
    authorizationSnapshotReader: transactionReader,
    roleRepository: roles,
    roleAssignmentRepository: assignments,
    permissionOverrideRepository: {} as PermissionOverrideRepository,
  };

  const executeOperation = async <T>(
    operation: (context: AccessControlUnitOfWorkContext) => Promise<T>,
  ): Promise<T> => {
    transactionActive = true;

    try {
      return await operation(context);
    } finally {
      transactionActive = false;
    }
  };

  const execute = vi.fn(executeOperation);

  const unitOfWork = {
    execute,
  } as unknown as AccessControlUnitOfWork;

  const getEffectiveDelegationPermissionCodes = vi
    .fn()
    .mockImplementation(async () => {
      expect(transactionActive).toBe(true);

      return [
        'organization.roles.assign',
        'organization.read',
        'branch.dashboard.read',
      ];
    });

  const getEffectiveAuthorizationContext = vi
    .fn()
    .mockImplementation(async () => {
      expect(transactionActive).toBe(true);

      return {
        snapshot: {},
        permissionCodes: [
          'organization.read',
          'branch.roles.assign',
          'branch.dashboard.read',
        ],
      };
    });

  const authorization = {
    getEffectiveDelegationPermissionCodes,
    getEffectiveAuthorizationContext,
  } as unknown as AuthorizationApplicationService;

  const now = vi.fn((): Date => {
    expect(transactionActive).toBe(true);
    return FIXED_TIME;
  });

  const clock: Clock = { now };

  return {
    handler: new AssignRoleHandler(unitOfWork, authorization, clock),
    execute,
    findAssignableById,
    findActiveOrganizationMembership,
    findActiveBranchMembership,
    existsActiveForTarget,
    saveAssignment,
    getEffectiveDelegationPermissionCodes,
    getEffectiveAuthorizationContext,
    transactionReader,
    now,
    isTransactionActive: () => transactionActive,
  };
}

describe('AssignRoleHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('assigns an Organization Role inside one Unit of Work after management and delegation checks', async () => {
    const result = await sut.handler.execute(createCommand());

    expect(result.assignmentId).toEqual(expect.any(String));
    expect(sut.execute).toHaveBeenCalledOnce();

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
        assignmentScope: 'ORGANIZATION',
      },
      sut.transactionReader,
    );

    expect(sut.findAssignableById).toHaveBeenCalledWith('org-1', 'role-1');

    expect(sut.findActiveOrganizationMembership).toHaveBeenCalledWith(
      'org-1',
      'membership-1',
    );

    expect(sut.existsActiveForTarget).toHaveBeenCalledWith({
      roleId: 'role-1',
      organizationMembershipId: 'membership-1',
    });

    expect(sut.now).toHaveBeenCalledOnce();
    expect(sut.saveAssignment).toHaveBeenCalledOnce();

    const assignment = sut.saveAssignment.mock.calls[0]?.[0] as RoleAssignment;
    expect(assignment).toBeInstanceOf(RoleAssignment);
    expect(assignment.roleId).toBe('role-1');
    expect(assignment.organizationMembershipId).toBe('membership-1');
    expect(assignment.branchMembershipId).toBeNull();
    expect(assignment.organizationId).toBe('org-1');
    expect(assignment.assignedById).toBe('actor-1');
    expect(assignment.createdAt).toEqual(FIXED_TIME);
    expect(assignment.isRevoked()).toBe(false);

    expect(sut.isTransactionActive()).toBe(false);
  });

  it('assigns a Branch Role using the exact target Branch authorization context', async () => {
    sut = createSut(createBranchRole());

    const result = await sut.handler.execute(
      createCommand({ target: 'BRANCH' }),
    );

    expect(result.assignmentId).toEqual(expect.any(String));
    expect(sut.execute).toHaveBeenCalledOnce();

    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      },
      sut.transactionReader,
    );

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();

    expect(sut.findActiveBranchMembership).toHaveBeenCalledWith(
      'org-1',
      'branch-1',
      'branch-membership-1',
    );

    expect(sut.existsActiveForTarget).toHaveBeenCalledWith({
      roleId: 'branch-role-1',
      branchMembershipId: 'branch-membership-1',
    });

    const assignment = sut.saveAssignment.mock.calls[0]?.[0] as RoleAssignment;
    expect(assignment.organizationMembershipId).toBeNull();
    expect(assignment.branchMembershipId).toBe('branch-membership-1');

    expect(sut.isTransactionActive()).toBe(false);
  });

  it('allows an assignable System Branch Role within an Organization', async () => {
    sut = createSut(createBranchRole({ organizationId: null }));

    await expect(
      sut.handler.execute(createCommand({ target: 'BRANCH' })),
    ).resolves.toMatchObject({
      assignmentId: expect.any(String),
    });

    expect(sut.saveAssignment).toHaveBeenCalledOnce();
  });

  it('rejects an empty actor before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findAssignableById).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
  });

  it('rejects an incomplete or ambiguous membership target before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ target: 'NONE' })),
    ).rejects.toBeInstanceOf(InvalidRoleAssignmentError);

    await expect(
      sut.handler.execute(
        new AssignRoleCommand('actor-1', {
          organizationId: 'org-1',
          roleId: 'role-1',
          branchMembershipId: 'branch-membership-1',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRoleAssignmentError);

    await expect(
      sut.handler.execute(
        new AssignRoleCommand('actor-1', {
          organizationId: 'org-1',
          roleId: 'role-1',
          organizationMembershipId: 'membership-1',
          branchMembershipId: 'branch-membership-1',
          branchId: 'branch-1',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRoleAssignmentError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findAssignableById).not.toHaveBeenCalled();
  });

  it('rejects missing Organization or Role identifiers before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ organizationId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidRoleAssignmentError);

    await expect(
      sut.handler.execute(createCommand({ roleId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidRoleAssignmentError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.findAssignableById).not.toHaveBeenCalled();
  });

  it('requires Organization role-assignment authority before Role lookup', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValueOnce([
      'organization.read',
    ]);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.execute).toHaveBeenCalledOnce();
    expect(sut.findAssignableById).not.toHaveBeenCalled();
    expect(sut.findActiveOrganizationMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('requires Branch role-assignment authority in the exact Branch context', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['branch.dashboard.read'],
    });

    await expect(
      sut.handler.execute(createCommand({ target: 'BRANCH' })),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findAssignableById).not.toHaveBeenCalled();
    expect(sut.findActiveBranchMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('returns not found when the Role is not available for assignment', async () => {
    sut.findAssignableById.mockResolvedValueOnce(null);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleNotFoundError,
    );

    expect(sut.findActiveOrganizationMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects a Role whose assignment scope does not match the target', async () => {
    await expect(
      sut.handler.execute(createCommand({ target: 'BRANCH' })),
    ).rejects.toBeInstanceOf(InvalidRoleAssignmentError);

    expect(sut.findActiveBranchMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects a Role permission the actor cannot delegate', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValueOnce([
      'organization.roles.assign',
    ]);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findActiveOrganizationMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects an archived Role', async () => {
    const archivedRole = createOrganizationRole();
    archivedRole.archive();
    sut.findAssignableById.mockResolvedValueOnce(archivedRole);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findActiveOrganizationMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
  });

  it('does not assign ORGANIZATION_OWNER through the generic workflow', async () => {
    const ownerRole = Role.create({
      id: 'owner-role',
      code: 'ORGANIZATION_OWNER',
      name: 'Organization Owner',
      definitionSource: 'SYSTEM',
      assignmentScope: 'ORGANIZATION',
      organizationId: null,
      isAssignable: false,
    });

    sut.findAssignableById.mockResolvedValueOnce(ownerRole);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findActiveOrganizationMembership).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
  });

  it('rejects an inactive or missing Organization membership target', async () => {
    sut.findActiveOrganizationMembership.mockResolvedValueOnce(null);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleAssignmentTargetNotFoundError,
    );

    expect(sut.existsActiveForTarget).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
  });

  it('rejects an inactive or missing Branch membership target', async () => {
    sut = createSut(createBranchRole());
    sut.findActiveBranchMembership.mockResolvedValueOnce(null);

    await expect(
      sut.handler.execute(createCommand({ target: 'BRANCH' })),
    ).rejects.toBeInstanceOf(RoleAssignmentTargetNotFoundError);

    expect(sut.existsActiveForTarget).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
  });

  it('rejects a duplicate active assignment', async () => {
    sut.existsActiveForTarget.mockResolvedValueOnce(true);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleAssignmentAlreadyExistsError,
    );

    expect(sut.saveAssignment).not.toHaveBeenCalled();
  });

  it('propagates authorization snapshot failures without repository reads', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockRejectedValueOnce(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.findAssignableById).not.toHaveBeenCalled();
    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates target lookup failures without saving an assignment', async () => {
    sut.findActiveOrganizationMembership.mockRejectedValueOnce(
      new Error('Membership lookup failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Membership lookup failed',
    );

    expect(sut.saveAssignment).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates assignment persistence failures', async () => {
    sut.saveAssignment.mockRejectedValueOnce(
      new Error('Assignment persistence failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Assignment persistence failed',
    );

    expect(sut.saveAssignment).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });
});
