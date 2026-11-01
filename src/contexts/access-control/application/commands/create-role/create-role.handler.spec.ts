import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../../domain/roles/role.js';
import type { RoleRepository } from '../../ports/role.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { RoleCodeAlreadyExistsError } from '../../errors/role-code-already-exists.error.js';
import { InvalidRoleDataError } from '../../../domain/errors/invalid-role-data.error.js';
import { CreateRoleCommand } from './create-role.command.js';
import { CreateRoleHandler } from './create-role.handler.js';

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

function createSut() {
  const existsByCode = vi.fn().mockResolvedValue(false);
  const findById = vi.fn().mockResolvedValue(null);
  const save = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const getEffectiveDelegationPermissionCodes = vi
    .fn()
    .mockResolvedValue([
      'organization.roles.create',
      'organization.roles.update',
      'organization.read',
      'branch.dashboard.read',
    ]);

  const roles = {
    existsByCode,
    findAssignableById: vi.fn().mockResolvedValue(null),
    findById,
    save,
    update,
  } as RoleRepository;

  const authorization = {
    getEffectiveDelegationPermissionCodes,
  } as unknown as AuthorizationApplicationService;

  const handler = new CreateRoleHandler(roles, authorization);

  return {
    handler,
    existsByCode,
    save,
    getEffectiveDelegationPermissionCodes,
  };
}

describe('CreateRoleHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('creates an Organization-defined Role after management and delegation checks', async () => {
    const result = await sut.handler.execute(createCommand());

    expect(result.roleId).toEqual(expect.any(String));

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledOnce();
    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
      assignmentScope: 'ORGANIZATION',
    });

    expect(sut.existsByCode).toHaveBeenCalledOnce();
    expect(sut.existsByCode).toHaveBeenCalledWith('org-1', 'SALES_MANAGER');

    expect(sut.save).toHaveBeenCalledOnce();

    const savedRole = sut.save.mock.calls[0]?.[0] as Role;
    expect(savedRole).toBeInstanceOf(Role);
    expect(savedRole.getDefinitionScope()).toBe('ORGANIZATION');
    expect(savedRole.getAssignmentScope()).toBe('ORGANIZATION');
    expect(savedRole.getOrganizationId()).toBe('org-1');
    expect(savedRole.isAssignable()).toBe(true);
    expect(savedRole.getPermissionCodes()).toEqual(['organization.read']);
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
    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
      assignmentScope: 'BRANCH',
    });
    expect(sut.save).toHaveBeenCalledOnce();

    const savedRole = sut.save.mock.calls[0]?.[0] as Role;
    expect(savedRole.getAssignmentScope()).toBe('BRANCH');
    expect(savedRole.getPermissionCodes()).toEqual(['branch.dashboard.read']);
  });

  it('rejects an empty actor before reading authorization or persistence', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('rejects when the actor lacks role-create management authority', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockResolvedValue([
      'organization.read',
    ]);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

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

  it('rejects a duplicate Role code within the same Organization', async () => {
    sut.existsByCode.mockResolvedValue(true);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleCodeAlreadyExistsError,
    );

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledOnce();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('validates the Role permission scope before authorization reads', async () => {
    await expect(
      sut.handler.execute(
        createCommand({
          assignmentScope: 'BRANCH',
          permissionCodes: ['organization.read'],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRoleDataError);

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('propagates authorization snapshot failures without attempting persistence', async () => {
    sut.getEffectiveDelegationPermissionCodes.mockRejectedValue(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.existsByCode).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('propagates Role persistence failures', async () => {
    sut.save.mockRejectedValue(new Error('Role persistence failed'));

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Role persistence failed',
    );

    expect(sut.save).toHaveBeenCalledOnce();
  });
});
