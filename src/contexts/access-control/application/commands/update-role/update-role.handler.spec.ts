import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../../domain/roles/role.js';
import { RoleNotFoundError } from '../../errors/role-not-found.error.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleUpdateError } from '../../errors/invalid-role-update.error.js';
import type { AuthorizationSnapshotReader } from '../../ports/authorization-snapshot-reader.port.js';
import type {
  AccessControlUnitOfWork,
  AccessControlUnitOfWorkContext,
} from '../../ports/access-control-unit-of-work.port.js';
import type { PermissionOverrideRepository } from '../../ports/permission-override.repository.js';
import type { RoleAssignmentRepository } from '../../ports/role-assignment.repository.js';
import type { RoleRepository } from '../../ports/role.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { UpdateRoleCommand } from './update-role.command.js';
import { UpdateRoleHandler } from './update-role.handler.js';

function createOrganizationRole(
  overrides: {
    organizationId?: string;
    permissionCodes?: readonly string[];
  } = {},
): Role {
  return Role.create({
    id: 'role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    description: 'Existing description',
    definitionScope: 'ORGANIZATION',
    assignmentScope: 'ORGANIZATION',
    organizationId: overrides.organizationId ?? 'org-1',
    isAssignable: true,
    permissionCodes: overrides.permissionCodes ?? ['organization.read'],
  });
}

function createCommand(
  overrides: {
    actorUserId?: string;
    organizationId?: string;
    roleId?: string;
    name?: string;
    description?: string | null;
    permissionCodes?: readonly string[];
  } = {},
): UpdateRoleCommand {
  const {
    actorUserId = 'actor-1',
    organizationId = 'org-1',
    roleId = 'role-1',
    ...changes
  } = overrides;

  return new UpdateRoleCommand(actorUserId, {
    organizationId,
    roleId,
    ...changes,
  });
}

function createSut(role: Role | null = createOrganizationRole()) {
  let transactionActive = false;

  const transactionReader = {
    loadSnapshot: vi.fn(),
    loadDelegationSnapshots: vi.fn(),
  } as AuthorizationSnapshotReader;

  const findById = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
    return role;
  });

  const update = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
  });

  const existsByCode = vi.fn().mockResolvedValue(false);
  const save = vi.fn().mockResolvedValue(undefined);

  const roles = {
    existsByCode,
    findAssignableById: vi.fn().mockResolvedValue(null),
    findById,
    save,
    update,
  } as RoleRepository;

  const context: AccessControlUnitOfWorkContext = {
    authorizationSnapshotReader: transactionReader,
    roleRepository: roles,
    roleAssignmentRepository: {} as RoleAssignmentRepository,
    permissionOverrideRepository: {} as PermissionOverrideRepository,
  };

  const executeOperation = async <T>(
    operation: (
      context: AccessControlUnitOfWorkContext,
    ) => Promise<T>,
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

  const getEffectiveAuthorizationContext = vi
    .fn()
    .mockImplementation(async () => {
      expect(transactionActive).toBe(true);

      return {
        snapshot: {},
        permissionCodes: ['organization.roles.update'],
      };
    });

  const getEffectiveDelegationPermissionCodes = vi
    .fn()
    .mockImplementation(async () => {
      expect(transactionActive).toBe(true);

      return [
        'organization.roles.update',
        'organization.read',
        'branch.dashboard.read',
      ];
    });

  const authorization = {
    getEffectiveAuthorizationContext,
    getEffectiveDelegationPermissionCodes,
  } as unknown as AuthorizationApplicationService;

  const handler = new UpdateRoleHandler(unitOfWork, authorization);

  return {
    handler,
    execute,
    findById,
    update,
    getEffectiveAuthorizationContext,
    getEffectiveDelegationPermissionCodes,
    transactionReader,
    isTransactionActive: () => transactionActive,
  };
}

describe('UpdateRoleHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('updates Role details inside one Unit of Work', async () => {
    const result = await sut.handler.execute(
      createCommand({ name: '  Sales Director  ' }),
    );

    expect(result).toEqual({ roleId: 'role-1' });
    expect(sut.execute).toHaveBeenCalledOnce();

    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
      },
      sut.transactionReader,
    );

    expect(sut.findById).toHaveBeenCalledWith('org-1', 'role-1');

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
        assignmentScope: 'ORGANIZATION',
      },
      sut.transactionReader,
    );

    expect(sut.update).toHaveBeenCalledOnce();

    const updatedRole = sut.update.mock.calls[0]?.[0] as Role;
    expect(updatedRole.getName()).toBe('Sales Director');
    expect(updatedRole.getDescription()).toBe('Existing description');

    expect(sut.isTransactionActive()).toBe(false);
  });

  it('replaces the complete Permission set and clears the description', async () => {
    const result = await sut.handler.execute(
      createCommand({
        description: null,
        permissionCodes: ['organization.read', 'branch.dashboard.read'],
      }),
    );

    expect(result.roleId).toBe('role-1');
    expect(sut.update).toHaveBeenCalledOnce();

    const updatedRole = sut.update.mock.calls[0]?.[0] as Role;
    expect(updatedRole.getName()).toBe('Sales Manager');
    expect(updatedRole.getDescription()).toBeNull();
    expect(updatedRole.getPermissionCodes()).toEqual([
      'organization.read',
      'branch.dashboard.read',
    ]);
  });

  it('rejects an empty actor before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findById).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('rejects missing identifiers and commands without changes', async () => {
    await expect(
      sut.handler.execute(createCommand({ organizationId: '  ', name: 'New' })),
    ).rejects.toBeInstanceOf(InvalidRoleUpdateError);

    await expect(
      sut.handler.execute(createCommand({ roleId: '  ', name: 'New' })),
    ).rejects.toBeInstanceOf(InvalidRoleUpdateError);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      InvalidRoleUpdateError,
    );

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findById).not.toHaveBeenCalled();
  });

  it('rejects an actor without management authority before looking up the Role', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: [],
    });

    await expect(
      sut.handler.execute(createCommand({ name: 'New Name' })),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findById).not.toHaveBeenCalled();
    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('returns not found when the Role does not belong to the supplied Organization', async () => {
    sut.findById.mockResolvedValueOnce(null);

    await expect(
      sut.handler.execute(createCommand({ name: 'New Name' })),
    ).rejects.toBeInstanceOf(RoleNotFoundError);

    expect(sut.findById).toHaveBeenCalledWith('org-1', 'role-1');
    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects modification of an archived Role', async () => {
    const archivedRole = createOrganizationRole();
    archivedRole.archive();
    sut.findById.mockResolvedValueOnce(archivedRole);

    await expect(
      sut.handler.execute(createCommand({ name: 'New Name' })),
    ).rejects.toThrow();

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects a non-delegable permission without persisting changes', async () => {
    await expect(
      sut.handler.execute(
        createCommand({ permissionCodes: ['organization.update'] }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledOnce();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('rejects a permission that the actor does not effectively hold', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValueOnce([
      'organization.roles.update',
    ]);

    await expect(
      sut.handler.execute(
        createCommand({ permissionCodes: ['organization.read'] }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.update).not.toHaveBeenCalled();
  });

  it('propagates the initial authorization snapshot failure', async () => {
    sut.getEffectiveAuthorizationContext.mockRejectedValueOnce(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(
      sut.handler.execute(createCommand({ name: 'New Name' })),
    ).rejects.toThrow('Authorization snapshot unavailable');

    expect(sut.findById).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates the delegation snapshot failure without persistence', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockRejectedValueOnce(
      new Error('Delegation snapshot unavailable'),
    );

    await expect(
      sut.handler.execute(createCommand({ name: 'New Name' })),
    ).rejects.toThrow('Delegation snapshot unavailable');

    expect(sut.findById).toHaveBeenCalledOnce();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates Role persistence failures', async () => {
    sut.update.mockRejectedValueOnce(new Error('Role update failed'));

    await expect(
      sut.handler.execute(createCommand({ name: 'New Name' })),
    ).rejects.toThrow('Role update failed');

    expect(sut.update).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });
});
