import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PermissionOverride,
  PERMISSION_OVERRIDE_EFFECT,
} from '../../../domain/permission-overrides/permission-override.js';
import type { PermissionOverrideRepository } from '../../ports/permission-override.repository.js';
import type { AuthorizationSnapshotReader } from '../../ports/authorization-snapshot-reader.port.js';
import type {
  AccessControlUnitOfWork,
  AccessControlUnitOfWorkContext,
} from '../../ports/access-control-unit-of-work.port.js';
import type { RoleAssignmentRepository } from '../../ports/role-assignment.repository.js';
import type { RoleRepository } from '../../ports/role.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidPermissionOverrideRequestError } from '../../errors/invalid-permission-override-request.error.js';
import { PermissionOverrideTargetNotFoundError } from '../../errors/permission-override-target-not-found.error.js';
import { SetPermissionOverrideCommand } from './set-permission-override.command.js';
import { SetPermissionOverrideHandler } from './set-permission-override.handler.js';

const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-01T12:00:00.000Z');

function createOverride(effect: 'ALLOW' | 'DENY' = 'DENY'): PermissionOverride {
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
    effect?: 'ALLOW' | 'DENY';
  } = {},
): SetPermissionOverrideCommand {
  return new SetPermissionOverrideCommand(overrides.actorUserId ?? 'actor-1', {
    organizationId: overrides.organizationId ?? 'org-1',
    organizationMembershipId:
      overrides.organizationMembershipId ?? 'membership-1',
    branchId: overrides.branchId ?? 'branch-1',
    permissionCode: overrides.permissionCode ?? 'branch.dashboard.read',
    effect: overrides.effect ?? 'DENY',
  });
}

function createSut(existing: PermissionOverride | null = null) {
  let transactionActive = false;

  const transactionReader = {
    loadSnapshot: vi.fn(),
    loadDelegationSnapshots: vi.fn(),
  } as AuthorizationSnapshotReader;

  const findActiveTarget = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);

    return {
      organizationMembership: {
        id: 'membership-1',
        organizationId: 'org-1',
      },
      branch: {
        id: 'branch-1',
        organizationId: 'org-1',
      },
    };
  });

  const findByUniqueKey = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
    return existing;
  });

  const save = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
  });

  const update = vi.fn().mockImplementation(async () => {
    expect(transactionActive).toBe(true);
  });

  const repository = {
    findActiveTarget,
    findByUniqueKey,
    save,
    update,
    delete: vi.fn(),
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

  const now = vi.fn((): Date => {
    expect(transactionActive).toBe(true);
    return UPDATED_AT;
  });

  const clock: Clock = { now };

  return {
    handler: new SetPermissionOverrideHandler(
      unitOfWork,
      authorization,
      clock,
    ),
    execute,
    findActiveTarget,
    findByUniqueKey,
    save,
    update,
    getEffectiveAuthorizationContext,
    transactionReader,
    now,
    isTransactionActive: () => transactionActive,
  };
}

describe('SetPermissionOverrideHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('creates a DENY override with override-management authority only', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['organization.members.permissions.manage'],
    });

    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({
      overrideId: expect.any(String),
      changed: true,
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

    expect(sut.findActiveTarget).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationMembershipId: 'membership-1',
      branchId: 'branch-1',
    });

    expect(sut.findByUniqueKey).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationMembershipId: 'membership-1',
      branchId: 'branch-1',
      permissionCode: 'branch.dashboard.read',
    });

    expect(sut.now).toHaveBeenCalledOnce();
    expect(sut.save).toHaveBeenCalledOnce();
    expect(sut.update).not.toHaveBeenCalled();

    const saved = sut.save.mock.calls[0]?.[0] as PermissionOverride;
    expect(saved).toBeInstanceOf(PermissionOverride);
    expect(saved.effect).toBe(PERMISSION_OVERRIDE_EFFECT.DENY);
    expect(saved.organizationMembershipId).toBe('membership-1');
    expect(saved.branchId).toBe('branch-1');
    expect(saved.assignedById).toBe('actor-1');
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('creates an ALLOW override when the actor holds the target Branch permission', async () => {
    const result = await sut.handler.execute(
      createCommand({ effect: 'ALLOW' }),
    );

    expect(result.changed).toBe(true);
    expect(sut.save).toHaveBeenCalledOnce();

    const saved = sut.save.mock.calls[0]?.[0] as PermissionOverride;
    expect(saved.effect).toBe(PERMISSION_OVERRIDE_EFFECT.ALLOW);
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects ALLOW when the actor does not hold the target permission', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['organization.members.permissions.manage'],
    });

    await expect(
      sut.handler.execute(createCommand({ effect: 'ALLOW' })),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findActiveTarget).not.toHaveBeenCalled();
    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('updates an existing DENY override to ALLOW after delegation validation', async () => {
    const existing = createOverride('DENY');
    sut = createSut(existing);

    const result = await sut.handler.execute(
      createCommand({ effect: 'ALLOW' }),
    );

    expect(result).toEqual({
      overrideId: 'override-1',
      changed: true,
    });
    expect(existing.effect).toBe('ALLOW');
    expect(existing.updatedAt).toEqual(UPDATED_AT);
    expect(sut.update).toHaveBeenCalledOnce();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('updates an existing ALLOW override to DENY without requiring delegation', async () => {
    const existing = createOverride('ALLOW');
    sut = createSut(existing);

    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['organization.members.permissions.manage'],
    });

    const result = await sut.handler.execute(createCommand({ effect: 'DENY' }));

    expect(result).toEqual({
      overrideId: 'override-1',
      changed: true,
    });
    expect(existing.effect).toBe('DENY');
    expect(sut.update).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('treats setting the same effect as an idempotent success', async () => {
    const existing = createOverride('DENY');
    sut = createSut(existing);

    const result = await sut.handler.execute(createCommand({ effect: 'DENY' }));

    expect(result).toEqual({
      overrideId: 'override-1',
      changed: false,
    });
    expect(sut.now).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects an empty actor before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findActiveTarget).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('rejects blank target identifiers before opening a transaction', async () => {
    await expect(
      sut.handler.execute(createCommand({ organizationId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidPermissionOverrideRequestError);

    await expect(
      sut.handler.execute(createCommand({ organizationMembershipId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidPermissionOverrideRequestError);

    await expect(
      sut.handler.execute(createCommand({ branchId: '  ' })),
    ).rejects.toBeInstanceOf(InvalidPermissionOverrideRequestError);

    await expect(
      sut.handler.execute(createCommand({ permissionCode: '  ' })),
    ).rejects.toBeInstanceOf(InvalidPermissionOverrideRequestError);

    expect(sut.execute).not.toHaveBeenCalled();
    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findActiveTarget).not.toHaveBeenCalled();
  });

  it('requires override-management authority before target lookup', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['branch.dashboard.read'],
    });

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findActiveTarget).not.toHaveBeenCalled();
    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('rejects an Organization-target permission', async () => {
    await expect(
      sut.handler.execute(
        createCommand({
          permissionCode: 'organization.read',
          effect: 'DENY',
        }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findActiveTarget).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown permission', async () => {
    await expect(
      sut.handler.execute(
        createCommand({
          permissionCode: 'branch.unknown.read',
          effect: 'DENY',
        }),
      ),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findActiveTarget).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
  });

  it('returns not found for an inactive or invalid target', async () => {
    sut.findActiveTarget.mockResolvedValueOnce(null);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      PermissionOverrideTargetNotFoundError,
    );

    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates authorization snapshot failures without target reads', async () => {
    sut.getEffectiveAuthorizationContext.mockRejectedValueOnce(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.findActiveTarget).not.toHaveBeenCalled();
    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates target lookup failures without persistence', async () => {
    sut.findActiveTarget.mockRejectedValueOnce(
      new Error('Override target lookup failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override target lookup failed',
    );

    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates override lookup failures without persistence', async () => {
    sut.findByUniqueKey.mockRejectedValueOnce(
      new Error('Override lookup failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override lookup failed',
    );

    expect(sut.save).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
    expect(sut.isTransactionActive()).toBe(false);
  });

  it('propagates override persistence failures', async () => {
    sut.save.mockRejectedValueOnce(new Error('Override persistence failed'));

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override persistence failed',
    );

    expect(sut.save).toHaveBeenCalledOnce();
    expect(sut.isTransactionActive()).toBe(false);
  });
});
