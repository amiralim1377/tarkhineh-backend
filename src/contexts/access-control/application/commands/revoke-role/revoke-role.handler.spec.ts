import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../../domain/roles/role.js';
import { RoleAssignment } from '../../../domain/role-assignments/role-assignment.js';
import type { RoleAssignmentRepository } from '../../ports/role-assignment.repository.js';
import type { AuthorizationApplicationService } from '../../services/authorization-application.service.js';
import type { Clock } from '../../../../../shared/application/ports/clock.port.js';
import { AccessControlActorRequiredError } from '../../errors/access-control-actor-required.error.js';
import { AccessControlForbiddenError } from '../../errors/access-control-forbidden.error.js';
import { InvalidRoleAssignmentRevocationError } from '../../errors/invalid-role-assignment-revocation.error.js';
import { RoleAssignmentNotFoundError } from '../../errors/role-assignment-not-found.error.js';
import { RevokeRoleCommand } from './revoke-role.command.js';
import { RevokeRoleHandler } from './revoke-role.handler.js';

const CREATED_AT = new Date('2026-10-31T10:00:00.000Z');
const REVOKED_AT = new Date('2026-11-01T12:00:00.000Z');

function createRole(scope: 'ORGANIZATION' | 'BRANCH' = 'ORGANIZATION') {
  return Role.create({
    id: 'role-1',
    code: scope === 'ORGANIZATION' ? 'SALES_MANAGER' : 'BRANCH_SUPERVISOR',
    name: 'Test Role',
    definitionScope: 'ORGANIZATION',
    assignmentScope: scope,
    organizationId: 'org-1',
    isAssignable: true,
    permissionCodes:
      scope === 'ORGANIZATION'
        ? ['organization.read']
        : ['branch.dashboard.read'],
  });
}

function createAssignment(
  scope: 'ORGANIZATION' | 'BRANCH' = 'ORGANIZATION',
): RoleAssignment {
  const role = createRole(scope);

  return RoleAssignment.create({
    id: 'assignment-1',
    role,
    organizationMembership:
      scope === 'ORGANIZATION'
        ? { id: 'membership-1', organizationId: 'org-1' }
        : null,
    branchMembership:
      scope === 'BRANCH'
        ? { id: 'branch-membership-1', organizationId: 'org-1' }
        : null,
    assignedById: 'assigner-1',
    createdAt: CREATED_AT,
  });
}

function createCommand(
  overrides: {
    actorUserId?: string;
    organizationId?: string;
    assignmentId?: string;
    branchId?: string;
  } = {},
): RevokeRoleCommand {
  return new RevokeRoleCommand(overrides.actorUserId ?? 'actor-1', {
    organizationId: overrides.organizationId ?? 'org-1',
    assignmentId: overrides.assignmentId ?? 'assignment-1',
    ...(overrides.branchId === undefined
      ? {}
      : { branchId: overrides.branchId }),
  });
}

function createSut(assignment: RoleAssignment | null = createAssignment()) {
  const findByIdForRevocation = vi.fn().mockResolvedValue(assignment);
  const update = vi.fn().mockResolvedValue(undefined);

  const getEffectiveAuthorizationContext = vi.fn().mockResolvedValue({
    snapshot: {},
    permissionCodes: ['organization.roles.assign', 'branch.roles.assign'],
  });

  const assignments = {
    findActiveOrganizationMembership: vi.fn(),
    findActiveBranchMembership: vi.fn(),
    existsActiveForTarget: vi.fn(),
    findByIdForRevocation,
    save: vi.fn(),
    update,
  } as unknown as RoleAssignmentRepository;

  const authorization = {
    getEffectiveAuthorizationContext,
  } as unknown as AuthorizationApplicationService;

  const now = vi.fn((): Date => REVOKED_AT);
  const clock: Clock = { now };

  return {
    handler: new RevokeRoleHandler(assignments, authorization, clock),
    findByIdForRevocation,
    update,
    getEffectiveAuthorizationContext,
    now,
  };
}

describe('RevokeRoleHandler', () => {
  let sut: ReturnType<typeof createSut>;

  beforeEach(() => {
    sut = createSut();
  });

  it('revokes an Organization assignment with Organization assignment authority', async () => {
    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({ assignmentId: 'assignment-1' });
    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
    });
    expect(sut.findByIdForRevocation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      assignmentId: 'assignment-1',
    });
    expect(sut.now).toHaveBeenCalledOnce();
    expect(sut.update).toHaveBeenCalledOnce();

    const updated = sut.update.mock.calls[0]?.[0] as RoleAssignment;
    expect(updated.isRevoked()).toBe(true);
    expect(updated.revokedAt).toEqual(REVOKED_AT);
  });

  it('revokes a Branch assignment only in the supplied Branch context', async () => {
    sut = createSut(createAssignment('BRANCH'));

    const result = await sut.handler.execute(
      createCommand({ branchId: 'branch-1' }),
    );

    expect(result).toEqual({ assignmentId: 'assignment-1' });
    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledWith({
      userId: 'actor-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    });
    expect(sut.findByIdForRevocation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      assignmentId: 'assignment-1',
      branchId: 'branch-1',
    });
    expect(sut.update).toHaveBeenCalledOnce();
  });

  it('rejects an empty actor before authorization or repository access', async () => {
    await expect(
      sut.handler.execute(createCommand({ actorUserId: '  ' })),
    ).rejects.toBeInstanceOf(AccessControlActorRequiredError);

    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findByIdForRevocation).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('rejects invalid identifiers or a blank supplied Branch ID', async () => {
    await expect(
      sut.handler.execute(createCommand({ organizationId: '  ' })),
    ).rejects.toBeInstanceOf(RoleAssignmentNotFoundError);

    await expect(
      sut.handler.execute(createCommand({ assignmentId: '  ' })),
    ).rejects.toBeInstanceOf(RoleAssignmentNotFoundError);

    await expect(
      sut.handler.execute(createCommand({ branchId: '  ' })),
    ).rejects.toBeInstanceOf(RoleAssignmentNotFoundError);

    expect(sut.getEffectiveAuthorizationContext).not.toHaveBeenCalled();
    expect(sut.findByIdForRevocation).not.toHaveBeenCalled();
  });

  it('requires Organization assignment authority before reading an assignment', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: [],
    });

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      AccessControlForbiddenError,
    );

    expect(sut.findByIdForRevocation).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('requires Branch assignment authority in the exact Branch context', async () => {
    sut.getEffectiveAuthorizationContext.mockResolvedValueOnce({
      snapshot: {},
      permissionCodes: ['organization.roles.assign'],
    });

    await expect(
      sut.handler.execute(createCommand({ branchId: 'branch-1' })),
    ).rejects.toBeInstanceOf(AccessControlForbiddenError);

    expect(sut.findByIdForRevocation).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('does not require permission delegation to revoke an assignment', async () => {
    await expect(sut.handler.execute(createCommand())).resolves.toEqual({
      assignmentId: 'assignment-1',
    });

    // RevokeRole deliberately does not call delegation-snapshot aggregation.
    expect(sut.getEffectiveAuthorizationContext).toHaveBeenCalledOnce();
    expect(sut.update).toHaveBeenCalledOnce();
  });

  it('returns not found for an assignment outside the requested target', async () => {
    sut = createSut(createAssignment('BRANCH'));

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleAssignmentNotFoundError,
    );

    expect(sut.update).not.toHaveBeenCalled();
  });

  it('returns not found when the assignment belongs to another Organization', async () => {
    const systemRole = Role.create({
      id: 'system-organization-role',
      code: 'GLOBAL_ORGANIZATION_READER',
      name: 'Global Organization Reader',
      definitionScope: 'SYSTEM',
      assignmentScope: 'ORGANIZATION',
      organizationId: null,
      isAssignable: true,
      permissionCodes: ['organization.read'],
    });

    const foreignAssignment = RoleAssignment.reconstitute({
      id: 'foreign-assignment',
      role: systemRole,
      organizationMembership: {
        id: 'foreign-membership',
        organizationId: 'org-2',
      },
      assignedById: 'assigner-1',
      createdAt: CREATED_AT,
      revokedAt: null,
    });

    // The repository should enforce this filter. This assertion additionally
    // proves the Handler fails closed if a faulty adapter returns a foreign row.
    sut.findByIdForRevocation.mockResolvedValueOnce(foreignAssignment);

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      RoleAssignmentNotFoundError,
    );

    expect(sut.update).not.toHaveBeenCalled();
    expect(foreignAssignment.isRevoked()).toBe(false);
  });

  it('treats an already revoked assignment as idempotent success', async () => {
    const assignment = createAssignment();
    expect(assignment.revoke(REVOKED_AT)).toBe(true);
    sut = createSut(assignment);

    const result = await sut.handler.execute(createCommand());

    expect(result).toEqual({ assignmentId: 'assignment-1' });
    expect(sut.now).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('rejects a clock value earlier than the assignment creation time', async () => {
    sut.now.mockReturnValueOnce(new Date('2026-10-30T10:00:00.000Z'));

    await expect(sut.handler.execute(createCommand())).rejects.toBeInstanceOf(
      InvalidRoleAssignmentRevocationError,
    );

    expect(sut.update).not.toHaveBeenCalled();
  });

  it('propagates authorization lookup failures without reading assignments', async () => {
    sut.getEffectiveAuthorizationContext.mockRejectedValueOnce(
      new Error('Authorization snapshot unavailable'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Authorization snapshot unavailable',
    );

    expect(sut.findByIdForRevocation).not.toHaveBeenCalled();
    expect(sut.update).not.toHaveBeenCalled();
  });

  it('propagates assignment lookup failures without persistence', async () => {
    sut.findByIdForRevocation.mockRejectedValueOnce(
      new Error('Assignment lookup failed'),
    );

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Assignment lookup failed',
    );

    expect(sut.update).not.toHaveBeenCalled();
  });

  it('propagates revocation persistence failures', async () => {
    sut.update.mockRejectedValueOnce(new Error('Assignment update failed'));

    await expect(sut.handler.execute(createCommand())).rejects.toThrow(
      'Assignment update failed',
    );

    expect(sut.update).toHaveBeenCalledOnce();
  });
});
