import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Role } from '../../../domain/roles/role.js';
import { ROLE_DEFINITION_SOURCE } from '../../../domain/roles/role.types.js';
import { InvalidRoleDataError } from '../../../domain/errors/invalid-role-data.error.js';

import type { AuthorizationSnapshotReader } from '../../ports/authorization-snapshot-reader.port.js';
import type {
  AccessControlUnitOfWork,
  AccessControlUnitOfWorkContext,
} from '../../ports/access-control-unit-of-work.port.js';
import type { RoleRepository } from '../../ports/role.repository.js';
import type { RoleAssignmentRepository } from '../../ports/role-assignment.repository.js';
import type { PermissionOverrideRepository } from '../../ports/permission-override.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';

import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { RoleCodeAlreadyExistsError } from '../../errors/role-code-already-exists.error.js';

import { CreateRoleCommand } from './create-role.command.js';
import { CreateRoleHandler } from './create-role.handler.js';

// ============================================================
// TEST COMMAND FACTORY
// ============================================================

function createCommand(
  overrides: Partial<{
    actorUserId: string;
    organizationId: string;
    code: string;
    name: string;
    assignmentScope: 'ORGANIZATION' | 'BRANCH';
    permissionCodes: readonly string[];
  }> = {},
): CreateRoleCommand {
  return new CreateRoleCommand(overrides.actorUserId ?? 'actor-1', {
    organizationId: overrides.organizationId ?? 'org-1',
    code: overrides.code ?? 'SALES_MANAGER',
    name: overrides.name ?? 'Sales Manager',
    description: 'Sales team permissions',
    assignmentScope: overrides.assignmentScope ?? 'ORGANIZATION',
    permissionCodes: overrides.permissionCodes ?? ['organization.read'],
  });
}

// ============================================================
// SYSTEM UNDER TEST
// ============================================================

function createSut() {
  let transactionActive = false;

  const transactionLoadSnapshot = vi.fn();
  const transactionLoadDelegationSnapshots = vi.fn();

  const transactionReader = {
    loadSnapshot: transactionLoadSnapshot,
    loadDelegationSnapshots: transactionLoadDelegationSnapshots,
  } as AuthorizationSnapshotReader;

  const existsByCode = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
    return false;
  });

  const findById = vi.fn().mockResolvedValue(null);

  const save = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
  });

  const update = vi.fn().mockResolvedValue(undefined);

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

  const execute = vi.fn(
    async (
      operation: (context: AccessControlUnitOfWorkContext) => Promise<unknown>,
    ) => {
      transactionActive = true;

      try {
        return await operation(context);
      } finally {
        transactionActive = false;
      }
    },
  );

  const unitOfWork = {
    execute,
  } as unknown as AccessControlUnitOfWork;

  const getEffectiveDelegationPermissionCodes = vi
    .fn()
    .mockImplementation(async () => {
      expect(transactionActive).toBe(true);

      return [
        'organization.roles.create',
        'organization.roles.update',
        'organization.read',
        'branch.dashboard.read',
      ];
    });

  const authorization = {
    getEffectiveDelegationPermissionCodes,
  } as unknown as AuthorizationApplicationService;

  const handler = new CreateRoleHandler(unitOfWork, authorization);

  return {
    handler,
    execute,
    existsByCode,
    save,
    getEffectiveDelegationPermissionCodes,
    transactionReader,
    isTransactionActive: () => transactionActive,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('CreateRoleHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  // ----------------------------------------------------------
  // SUCCESSFUL ROLE CREATION
  // ----------------------------------------------------------

  it('creates an Organization-defined Role inside one Unit of Work', async () => {
    const result = await sut.handler.execute(createCommand());

    expect(result.roleId).toEqual(expect.any(String));
    expect(sut.execute).toHaveBeenCalledOnce();

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledOnce();
    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
        assignmentScope: 'ORGANIZATION',
      },
      sut.transactionReader,
    );

    expect(sut.existsByCode).toHaveBeenCalledOnce();
    expect(sut.existsByCode).toHaveBeenCalledWith('org-1', 'SALES_MANAGER');

    expect(sut.save).toHaveBeenCalledOnce();
    expect(sut.save).toHaveBeenCalledWith(expect.any(Role), 'actor-1');

    const savedRole = sut.save.mock.calls[0]?.[0] as Role;

    expect(savedRole).toBeInstanceOf(Role);

    expect(savedRole.getDefinitionSource()).toBe(
      ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED,
    );

    expect(savedRole.getAssignmentScope()).toBe('ORGANIZATION');
    expect(savedRole.getOrganizationId()).toBe('org-1');
    expect(savedRole.isAssignable()).toBe(true);
    expect(savedRole.getPermissionCodes()).toEqual(['organization.read']);

    expect(sut.isTransactionActive()).toBe(false);
  });

  it('supports a Branch-assignment Role when its permission is delegable by the actor', async () => {
    const result = await sut.handler.execute(
      createCommand({
        code: 'BRANCH_SALES_MANAGER',
        assignmentScope: 'BRANCH',
        permissionCodes: ['branch.dashboard.read'],
      }),
    );

    expect(result.roleId).toEqual(expect.any(String));

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
        assignmentScope: 'BRANCH',
      },
      sut.transactionReader,
    );

    expect(sut.save).toHaveBeenCalledOnce();

    const savedRole = sut.save.mock.calls[0]?.[0] as Role;

    expect(savedRole.getAssignmentScope()).toBe('BRANCH');
    expect(savedRole.getPermissionCodes()).toEqual(['branch.dashboard.read']);
  });

  // ----------------------------------------------------------
  // INPUT VALIDATION
  // ----------------------------------------------------------

  it('rejects an empty actor before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('validates the Role permission scope before opening a transaction', async () => {
    await expect(
      sut.handler.execute(
        createCommand({
          assignmentScope: 'BRANCH',
          permissionCodes: ['organization.read'],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRoleDataError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // AUTHORIZATION
  // ----------------------------------------------------------

  it('rejects when the actor lacks role-create management authority', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValue([
      'organization.read',
    ]);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.execute).toHaveBeenCalledOnce();
    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('rejects a non-delegable permission even when the actor can create Roles', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValue([
      'organization.roles.create',
      'organization.update',
    ]);

    await expect(
      sut.handler.execute(
        createCommand({ permissionCodes: ['organization.update'] }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('rejects a permission the actor does not effectively hold', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValue([
      'organization.roles.create',
    ]);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // ROLE CODE VALIDATION
  // ----------------------------------------------------------

  it('rejects a duplicate Role code within the same Organization', async () => {
    sut.existsByCode.mockResolvedValue(true);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleCodeAlreadyExistsError,
    );

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledOnce();
    expect(sut.save).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // ERROR PROPAGATION
  // ----------------------------------------------------------

  it('propagates authorization snapshot failures without attempting persistence', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockRejectedValue(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates Role persistence failures', async () => {
    sut.save.mockRejectedValue(new Error('Role persistence failed'));

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Role persistence failed',
    );

    expect(sut.save).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });
});
