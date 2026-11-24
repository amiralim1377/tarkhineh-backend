import { AccessControlAuthorization } from '../../../access-control/contracts/authorization.contract.js';
import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../domain/types/membership-invitation-scope.js';
import { AccessControlMembershipInvitationAuthorizationAdapter } from './access-control-membership-invitation-authorization.adapter.js';

describe('AccessControlMembershipInvitationAuthorizationAdapter', () => {
  const authorization = {
    checkPermission: vi.fn(),
  };

  let adapter: AccessControlMembershipInvitationAuthorizationAdapter;

  beforeEach(() => {
    vi.resetAllMocks();

    adapter = new AccessControlMembershipInvitationAuthorizationAdapter(
      authorization as unknown as AccessControlAuthorization,
    );
  });

  describe('canCreateMembershipInvitation', () => {
    describe('organization invitation', () => {
      it('should return true when organization invitation permission is granted', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        } as const;

        authorization.checkPermission.mockResolvedValue({
          allowed: true,
        });

        // Act
        const actual = await adapter.canCreateMembershipInvitation(input);

        // Assert
        expect(actual).toBe(true);
        expect(authorization.checkPermission).toHaveBeenCalledTimes(1);
        expect(authorization.checkPermission).toHaveBeenCalledOnce();
        expect(authorization.checkPermission).toHaveBeenCalledWith({
          userId: input.actorUserId,
          organizationId: input.organizationId,
          permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
        });
      });

      it('should return false when organization invitation permission is denied', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        } as const;

        authorization.checkPermission.mockResolvedValue({
          allowed: false,
        });

        // Act
        const actual = await adapter.canCreateMembershipInvitation(input);

        // Assert
        expect(actual).toBe(false);
        expect(authorization.checkPermission).toHaveBeenCalledTimes(1);
        expect(authorization.checkPermission).toHaveBeenCalledWith({
          userId: input.actorUserId,
          organizationId: input.organizationId,
          permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
        });
      });

      it('should propagate authorization errors', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
        } as const;

        const authorizationError = new Error(
          'Authorization service unavailable',
        );

        authorization.checkPermission.mockRejectedValue(authorizationError);

        // Act & Assert
        await expect(adapter.canCreateMembershipInvitation(input)).rejects.toBe(
          authorizationError,
        );
      });
    });

    describe('branch invitation', () => {
      it('should return true when organization invitation permission is granted', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
          branchId: 'branch-123',
        } as const;

        authorization.checkPermission.mockResolvedValue({
          allowed: true,
        });

        // Act
        const actual = await adapter.canCreateMembershipInvitation(input);

        // Assert
        expect(actual).toBe(true);
        expect(authorization.checkPermission).toHaveBeenCalledTimes(1);
        expect(authorization.checkPermission).toHaveBeenCalledOnce();
        expect(authorization.checkPermission).toHaveBeenCalledWith({
          userId: input.actorUserId,
          organizationId: input.organizationId,
          permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
        });
      });

      it('should check branch invitation permission when organization permission is denied', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
          branchId: 'branch-123',
        } as const;

        authorization.checkPermission
          .mockResolvedValueOnce({
            allowed: false,
          })
          .mockResolvedValueOnce({
            allowed: true,
          });

        // Act
        const actual = await adapter.canCreateMembershipInvitation(input);

        // Assert
        expect(actual).toBe(true);
        expect(authorization.checkPermission).toHaveBeenCalledTimes(2);

        expect(authorization.checkPermission).toHaveBeenNthCalledWith(1, {
          userId: input.actorUserId,
          organizationId: input.organizationId,
          permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
        });

        expect(authorization.checkPermission).toHaveBeenNthCalledWith(2, {
          userId: input.actorUserId,
          organizationId: input.organizationId,
          branchId: input.branchId,
          permissionCode: PERMISSION_CODE.BRANCH_STAFF_INVITE,
        });
      });

      it('should return false when both organization and branch permissions are denied', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
          branchId: 'branch-123',
        } as const;

        authorization.checkPermission
          .mockResolvedValueOnce({
            allowed: false,
          })
          .mockResolvedValueOnce({
            allowed: false,
          });

        // Act
        const actual = await adapter.canCreateMembershipInvitation(input);

        // Assert
        expect(actual).toBe(false);
        expect(authorization.checkPermission).toHaveBeenCalledTimes(2);
      });

      it('should propagate errors when checking organization permission', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
          branchId: 'branch-123',
        } as const;

        const authorizationError = new Error(
          'Organization authorization service unavailable',
        );

        authorization.checkPermission.mockRejectedValue(authorizationError);

        // Act & Assert
        await expect(adapter.canCreateMembershipInvitation(input)).rejects.toBe(
          authorizationError,
        );

        expect(authorization.checkPermission).toHaveBeenCalledOnce();
      });

      it('should propagate errors when checking branch permission', async () => {
        // Arrange
        const input = {
          actorUserId: 'user-123',
          organizationId: 'organization-123',
          scope: MEMBERSHIP_INVITATION_SCOPE.BRANCH,
          branchId: 'branch-123',
        } as const;

        const authorizationError = new Error(
          'Branch authorization service unavailable',
        );

        authorization.checkPermission
          .mockResolvedValueOnce({
            allowed: false,
          })
          .mockRejectedValueOnce(authorizationError);

        // Act & Assert
        await expect(adapter.canCreateMembershipInvitation(input)).rejects.toBe(
          authorizationError,
        );

        expect(authorization.checkPermission).toHaveBeenCalledTimes(2);

        expect(authorization.checkPermission).toHaveBeenNthCalledWith(2, {
          userId: input.actorUserId,
          organizationId: input.organizationId,
          branchId: input.branchId,
          permissionCode: PERMISSION_CODE.BRANCH_STAFF_INVITE,
        });
      });
    });
  });
});
