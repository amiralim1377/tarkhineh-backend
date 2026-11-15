import { describe, expect, it, vi } from 'vitest';
import {
  PERMISSION_CODE,
  PERMISSION_RESOURCE_LEVEL,
} from '../../../domain/permissions/permission-catalog.js';
import { PERMISSION_DEFINITIONS } from '../../../domain/permissions/permission-catalog-derived.js';
import {
  ROLE_ASSIGNMENT_TARGET,
  type RoleAssignmentTarget,
} from '../../../domain/roles/role.types.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import { ListAvailablePermissionsHandler } from './list-available-permissions.handler.js';
import { ListAvailablePermissionsQuery } from './list-available-permissions.query.js';

function createSut(permissionCodes: readonly string[] = []) {
  const getEffectiveDelegationPermissionCodes = vi
    .fn()
    .mockResolvedValue(permissionCodes);

  const authorization = {
    getEffectiveDelegationPermissionCodes,
  } as unknown as AuthorizationApplicationService;

  return {
    handler: new ListAvailablePermissionsHandler(authorization),
    getEffectiveDelegationPermissionCodes,
  };
}

function createQuery(
  input: {
    userId?: string;
    organizationId?: string;
    assignmentTarget?: string;
  } = {},
) {
  return new ListAvailablePermissionsQuery({
    userId: input.userId ?? 'actor-1',
    organizationId: input.organizationId ?? 'org-1',
    assignmentTarget: (input.assignmentTarget ??
      ROLE_ASSIGNMENT_TARGET.ORGANIZATION) as RoleAssignmentTarget,
  });
}

describe('ListAvailablePermissionsHandler', () => {
  it('returns delegated and delegable permissions for an Organization Role', async () => {
    const sut = createSut([
      PERMISSION_CODE.ORGANIZATION_READ,
      PERMISSION_CODE.ORGANIZATION_UPDATE,
      PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      PERMISSION_CODE.BRANCH_STAFF_READ,
    ]);

    const result = await sut.handler.execute(createQuery());

    expect(result.map(({ code }) => code)).toEqual([
      PERMISSION_CODE.ORGANIZATION_READ,
      PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      PERMISSION_CODE.BRANCH_STAFF_READ,
    ]);
    expect(result.every((permission) => permission.delegable)).toBe(true);

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
      assignmentTarget: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
    });
  });

  it('returns only Branch-level permissions for a Branch Role', async () => {
    const sut = createSut([
      PERMISSION_CODE.ORGANIZATION_READ,
      PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      PERMISSION_CODE.BRANCH_STAFF_READ,
    ]);

    const result = await sut.handler.execute(
      createQuery({ assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH }),
    );

    expect(result.map(({ code }) => code)).toEqual([
      PERMISSION_CODE.BRANCH_DASHBOARD_READ,
      PERMISSION_CODE.BRANCH_STAFF_READ,
    ]);
    expect(
      result.every(
        ({ resourceLevel }) =>
          resourceLevel === PERMISSION_RESOURCE_LEVEL.BRANCH,
      ),
    ).toBe(true);

    expect(sut.getEffectiveDelegationPermissionCodes).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
      assignmentTarget: ROLE_ASSIGNMENT_TARGET.BRANCH,
    });
  });

  it('returns source-controlled Registry metadata unchanged', async () => {
    const sut = createSut([PERMISSION_CODE.ORGANIZATION_READ]);

    const result = await sut.handler.execute(createQuery());
    const definition = PERMISSION_DEFINITIONS.find(
      ({ code }) => code === PERMISSION_CODE.ORGANIZATION_READ,
    );

    expect(result).toEqual([definition]);
    expect(result[0]?.name).toEqual({
      en: 'View Organization',
      fa: 'مشاهده سازمان',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns an empty list when the actor has no delegable permissions', async () => {
    const sut = createSut([]);

    await expect(sut.handler.execute(createQuery())).resolves.toEqual([]);
  });

  it('does not query authorization for a blank actor', async () => {
    const sut = createSut();

    await expect(
      sut.handler.execute(createQuery({ userId: '  ' })),
    ).resolves.toEqual([]);

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
  });

  it('does not query authorization for a blank Organization', async () => {
    const sut = createSut();

    await expect(
      sut.handler.execute(createQuery({ organizationId: '  ' })),
    ).resolves.toEqual([]);

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
  });

  it('does not query authorization for an invalid assignment target', async () => {
    const sut = createSut();

    await expect(
      sut.handler.execute(createQuery({ assignmentTarget: 'INVALID' })),
    ).resolves.toEqual([]);

    expect(sut.getEffectiveDelegationPermissionCodes).not.toHaveBeenCalled();
  });

  it('propagates authorization service failures', async () => {
    const sut = createSut();
    sut.getEffectiveDelegationPermissionCodes.mockRejectedValueOnce(
      new Error('Delegation snapshot unavailable'),
    );

    await expect(sut.handler.execute(createQuery())).rejects.toThrow(
      'Delegation snapshot unavailable',
    );
  });
});
