import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionOverride } from '../../../domain/permission-overrides/permission-override.js';
import type { PermissionOverrideRepository } from '../../ports/permission-override.repository.js';
import type { AuthorizationSnapshotReader } from '../../ports/authorization-snapshot-reader.port.js';
import type {
  AccessControlUnitOfWork,
  AccessControlUnitOfWorkContext,
} from '../../ports/access-control-unit-of-work.port.js';
import type { RoleAssignmentRepository } from '../../ports/role-assignment.repository.js';
import type { RoleRepository } from '../../ports/role.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidPermissionOverrideRequestError } from '../../errors/invalid-permission-override-request.error.js';
import { RemovePermissionOverrideCommand } from './remove-permission-override.command.js';
import { RemovePermissionOverrideHandler } from './remove-permission-override.handler.js';

const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');

function createOverride(effect: 'ALLOW' | 'DENY'): PermissionOverride {
  return PermissionOverride.create({
    id: 'override-1',
    organizationId: 'org-1',
    organizationMembership: {
      id: 'membership-1',
      organizationId: 'org-1',
    },
    branch: {
      id: 'branch-1',
      organizationId: 'org-1',
    },
    permissionCode: 'branch.dashboard.read',
    assignedById: 'original-actor',
    effect,
    createdAt: CREATED_AT,
  });
}

function createCommand(
  overrides: {
    actorUserId?: string;
    organizationId?: string;
    organizationMembershipId?: string;
    branchId?: string;
    permissionCode?: string;
  } = {},
): RemovePermissionOverrideCommand {
  return new RemovePermissionOverrideCommand(
    overrides.actorUserId ?? 'actor-1',
    {
      organizationId: overrides.organizationId ?? 'org-1',
      organizationMembershipId:
        overrides.organizationMembershipId ?? 'membership-1',
      branchId: overrides.branchId ?? 'branch-1',
      permissionCode: overrides.permissionCode ?? 'branch.dashboard.read',
    },
  );
}

function createSut(
  existing: PermissionOverride | null = createOverride('DENY'),
) {
  let transactionActive = false;

  const transactionReader = {
    loadSnapshot: vi.fn(),
    loadDelegationSnapshots: vi.fn(),
  } as AuthorizationSnapshotReader;

  const findByUniqueKey = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
    return existing;
  });

  const deleteOverride = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
  });

  const repository = {
    findActiveTarget: vi.fn(),
    findByUniqueKey,
    save: vi.fn(),
    update: vi.fn(),
    delete: deleteOverride,
  } as PermissionOverrideRepository;

  const context: AccessControlUnitOfWorkContext = {
    authorizationSnapshotReader: transactionReader,
    roleRepository: {} as RoleRepository,
    roleAssignmentRepository: {} as RoleAssignmentRepository,
    permissionOverrideRepository: repository,
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
        permissionCodes: [
          'organization.members.permissions.manage',
          'branch.dashboard.read',
        ],
      };
    });

  const authorization = {
    getEffectiveAuthorizationContext,
  } as unknown as AuthorizationApplicationService;

  return {
    handler: new RemovePermissionOverrideHandler(
      unitOfWork,
      authorization,
    ),
    execute,
    findByUniqueKey,
    deleteOverride,
    getEffectiveAuthorizationContext,
    transactionReader,
    isTransactionActive: () => transactionActive,
  };
}

describe('RemovePermissionOverrideHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('removes DENY when the actor can delegate the underlying permission', async () => {
    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({
      overrideId: 'override-1',
      removed: true,
    });

    expect(sut.execute).toHaveBeenCalledOnce();

    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledWith(
      {
        userId: 'actor-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      },
      sut.transactionReader,
    );

    expect(sut.findByUniqueKey).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationMembershipId: 'membership-1',
      branchId: 'branch-1',
      permissionCode: 'branch.dashboard.read',
    });

    expect(sut.deleteOverride).toHaveBeenCalledOnce();
    expect(sut.deleteOverride).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'override-1' }),
    );
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects removing DENY when the actor lacks the underlying permission', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['organization.members.permissions.manage'],
    });

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findByUniqueKey).toHaveBeenCalledOnce();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('removes ALLOW with management authority without requiring the target permission', async () => {
    sut = createSut(createOverride('ALLOW'));

    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['organization.members.permissions.manage'],
    });

    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({
      overrideId: 'override-1',
      removed: true,
    });
    expect(sut.deleteOverride).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('returns an idempotent result when no matching Override exists', async () => {
    sut = createSut(null);

    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({
      overrideId: null,
      removed: false,
    });
    expect(sut.findByUniqueKey).toHaveBeenCalledOnce();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects an empty actor before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
  });

  it('rejects blank identifiers before opening a transaction', async () => {
    const invalidInputs = [
      { organizationId: '  ' },
      { organizationMembershipId: '  ' },
      { branchId: '  ' },
      { permissionCode: '  ' },
    ];

    for (const input of invalidInputs) {
      await expect(
        sut.handler.execute(createCommand(input)),
      ).rejects.toBeInstanceOf(InvalidPermissionOverrideRequestError);
    }

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
  });

  it('requires override-management authority before reading the Override', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['branch.dashboard.read'],
    });

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects Organization-target permissions before reading the Override', async () => {
    await expect(
      sut.handler.execute(
        createCommand({ permissionCode: 'organization.read' }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
  });

  it('rejects unknown permissions before reading the Override', async () => {
    await expect(
      sut.handler.execute(
        createCommand({ permissionCode: 'branch.unknown.read' }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
  });

  it('propagates authorization snapshot failures without reading the Override', async () => {
    sut.getEffectiveAuthorizationContext.mockRejectedValueOnce(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates Override lookup failures without deleting', async () => {
    sut.findByUniqueKey.mockRejectedValueOnce(
      new Error('Override lookup failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override lookup failed',
    );

    expect(sut.deleteOverride).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates persistence failures', async () => {
    sut.deleteOverride.mockRejectedValueOnce(
      new Error('Override deletion failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override deletion failed',
    );

    expect(sut.deleteOverride).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });
});
