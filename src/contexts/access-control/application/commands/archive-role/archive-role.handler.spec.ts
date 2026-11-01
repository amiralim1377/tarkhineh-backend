import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../../domain/roles/role.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleArchiveError } from '../../errors/invalid-role-archive.error.js';
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
import { ArchiveRoleCommand } from './archive-role.command.js';
import { ArchiveRoleHandler } from './archive-role.handler.js';

function createOrganizationRole(organizationId = 'org-1'): Role {
  return Role.create({
    id: 'role-1',
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    definitionScope: 'ORGANIZATION',
    assignmentScope: 'ORGANIZATION',
    organizationId,
    isAssignable: true,
    permissionCodes: ['organization.read'],
  });
}

function createCommand(
  overrides: {
    actorUserId?: string;
    organizationId?: string;
    roleId?: string;
  } = {},
): ArchiveRoleCommand {
  return new ArchiveRoleCommand(overrides.actorUserId ?? 'actor-1', {
    organizationId: overrides.organizationId ?? 'org-1',
    roleId: overrides.roleId ?? 'role-1',
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

  const roles = {
    existsByCode: vi.fn(),
    findAssignableById: vi.fn(),
    findById,
    save: vi.fn(),
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
        permissionCodes: ['organization.roles.archive'],
      };
    });

  const authorization = {
    getEffectiveAuthorizationContext,
  } as unknown as AuthorizationApplicationService;

  const handler = new ArchiveRoleHandler(unitOfWork, authorization);

  return {
    handler,
    execute,
    findById,
    update,
    getEffectiveAuthorizationContext,
    transactionReader,
    isTransactionActive: () => transactionActive,
  };
}

describe('ArchiveRoleHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('archives an Organization-owned Role inside one Unit of Work', async () => {
    const result = await sut.handler.execute(createCommand());

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
    expect(sut.update).toHaveBeenCalledOnce();

    const archivedRole = sut.update.mock.calls[0]?.[0] as Role;
    expect(archivedRole.isEffectiveForAuthorization()).toBe(false);
    expect(archivedRole.getStatus()).toBe('ARCHIVED');

    expect(sut.isTransactionActive()).toBe(false);
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

  it('rejects empty identifiers before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ organizationId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidRoleArchiveError);

    await expect(
      sut.handler.execute(createCommand({ roleId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidRoleArchiveError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findById).not.toHaveBeenCalled();
  });

  it('requires archive authority before looking up the Role', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: [],
    });

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.execute).toHaveBeenCalledOnce();
    expect(sut.findById).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('returns not found when the Role does not exist in the Organization', async () => {
    sut.findById.mockResolvedValueOnce(null);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleNotFoundError,
    );

    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('does not archive a Role owned by another Organization', async () => {
    sut.findById.mockResolvedValueOnce(createOrganizationRole('org-2'));

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleNotFoundError,
    );

    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('does not archive a System Role through the Organization workflow', async () => {
    const systemRole = Role.create({
      id: 'system-role-1',
      code: 'BRANCH_MANAGER',
      name: 'Branch Manager',
      definitionScope: 'SYSTEM',
      assignmentScope: 'BRANCH',
      organizationId: null,
      isAssignable: true,
    });

    sut.findById.mockResolvedValueOnce(systemRole);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleNotFoundError,
    );

    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('treats an already archived Role as an idempotent success', async () => {
    const archivedRole = createOrganizationRole();
    archivedRole.archive();
    sut.findById.mockResolvedValueOnce(archivedRole);

    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({ roleId: 'role-1' });
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates authorization snapshot failures without repository access', async () => {
    sut.getEffectiveAuthorizationContext.mockRejectedValueOnce(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.findById).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates persistence failures', async () => {
    sut.update.mockRejectedValueOnce(new Error('Role archive failed'));

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Role archive failed',
    );

    expect(sut.update).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });
});
