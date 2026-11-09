import { AccessControlAuthorization } from '../../../access-control/contracts/authorization.contract.js';
import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';
import { AccessControlBranchCreationAuthorizationAdapter } from './access-control-branch-creation.adapter.js';

describe('AccessControlBranchCreationAuthorizationAdapter', () => {
  const authorization = {
    checkPermission: vi.fn(),
  };

  let adapter: AccessControlBranchCreationAuthorizationAdapter;

  beforeEach(() => {
    vi.resetAllMocks();

    adapter = new AccessControlBranchCreationAuthorizationAdapter(
      authorization as unknown as AccessControlAuthorization,
    );
  });

  describe('canCreateBranch', () => {
    it('should return true when permission is granted', async () => {
      // arrange
      const input = {
        actorUserId: 'user-123',
        organizationId: 'organization-123',
      };

      authorization.checkPermission.mockResolvedValue({
        allowed: true,
      });

      //   act
      const actual = await adapter.canCreateBranch(input);

      //   assert
      expect(actual).toBe(true);
      expect(authorization.checkPermission).toHaveBeenCalledTimes(1);
      expect(authorization.checkPermission).toHaveBeenCalledOnce();
      expect(authorization.checkPermission).toHaveBeenCalledWith({
        userId: input.actorUserId,
        organizationId: input.organizationId,
        permissionCode: PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
      });
    });

    it('should return false when permission is denied', async () => {
      // arrange
      const input = {
        actorUserId: 'user-123',
        organizationId: 'organization-123',
      };

      authorization.checkPermission.mockResolvedValue({
        allowed: false,
      });

      //   act
      const actual = await adapter.canCreateBranch(input);

      //   assert
      expect(actual).toBe(false);
      expect(authorization.checkPermission).toHaveBeenCalledTimes(1);
      expect(authorization.checkPermission).toHaveBeenCalledOnce();
      expect(authorization.checkPermission).toHaveBeenCalledWith({
        userId: input.actorUserId,
        organizationId: input.organizationId,
        permissionCode: PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
      });
    });

    it('should propagate authorization errors', async () => {
      // Arrange
      const input = {
        actorUserId: 'user-123',
        organizationId: 'organization-123',
      };

      const authorizationError = new Error('Authorization service unavailable');

      authorization.checkPermission.mockRejectedValue(authorizationError);

      // Act & Assert
      await expect(adapter.canCreateBranch(input)).rejects.toBe(
        authorizationError,
      );
    });
  });
});
