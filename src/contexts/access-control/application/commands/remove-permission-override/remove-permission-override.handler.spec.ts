import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionOverride } from '../../../domain/permission-overrides/permission-override.js';
import type { PermissionOverrideRepository } from '../../ports/permission-override.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
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
  const findByUniqueKey = vi.fn().mockResolvedValue(existing);
  const save = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const deleteOverride = vi.fn().mockResolvedValue(undefined);

  const getEffectiveAuthorizationContext = vi.fn().mockResolvedValue({
    snapshot: {},
    permissionCodes: [
      'organization.members.permissions.manage',
      'branch.dashboard.read',
    ],
  });

  const now = vi.fn((): Date => CREATED_AT);
  const clock: Clock = { now };

  const repository = {
    findActiveTarget: vi.fn().mockResolvedValue(null),
    findByUniqueKey,
    save,
    update,
    delete: deleteOverride,
  } as PermissionOverrideRepository;

  const authorization = {
    getEffectiveAuthorizationContext,
  } as unknown as AuthorizationApplicationService;

  return {
    handler: new RemovePermissionOverrideHandler(
      repository,
      authorization,
      clock,
    ),
    findByUniqueKey,
    deleteOverride,
    getEffectiveAuthorizationContext,
    now,
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

    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    });

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
  });

  it('rejects an empty actor before authorization or persistence', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findByUniqueKey).not.toHaveBeenCalled();
    expect(sut.deleteOverride).not.toHaveBeenCalled();
  });

  it('rejects blank identifiers before authorization', async () => {
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
  });

  it('propagates Override lookup failures without deleting', async () => {
    sut.findByUniqueKey.mockRejectedValueOnce(
      new Error('Override lookup failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override lookup failed',
    );

    expect(sut.deleteOverride).not.toHaveBeenCalled();
  });

  it('propagates persistence failures', async () => {
    sut.deleteOverride.mockRejectedValueOnce(
      new Error('Override deletion failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Override deletion failed',
    );

    expect(sut.deleteOverride).toHaveBeenCalledOnce();
  });
});
