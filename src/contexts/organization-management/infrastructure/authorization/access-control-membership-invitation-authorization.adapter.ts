import { Inject, Injectable } from '@nestjs/common';
import {
  ACCESS_CONTROL_AUTHORIZATION,
  type AccessControlAuthorization,
} from '../../../access-control/contracts/authorization.contract.js';
import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../domain/types/membership-invitation-scope.js';
import type { MembershipInvitationAuthorizationPort } from '../../application/ports/membership-invitation-authorization.port.js';

@Injectable()
export class AccessControlMembershipInvitationAuthorizationAdapter implements MembershipInvitationAuthorizationPort {
  constructor(
    @Inject(ACCESS_CONTROL_AUTHORIZATION)
    private readonly authorization: AccessControlAuthorization,
  ) {}

  async canCreateMembershipInvitation(
    input: Parameters<
      MembershipInvitationAuthorizationPort['canCreateMembershipInvitation']
    >[0],
  ): Promise<boolean> {
    if (input.scope === MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION) {
      const decision = await this.authorization.checkPermission({
        userId: input.actorUserId,
        organizationId: input.organizationId,
        permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
      });

      return decision.allowed;
    }

    const organizationDecision = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE,
    });

    if (organizationDecision.allowed) {
      return true;
    }

    const branchDecision = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      permissionCode: PERMISSION_CODE.BRANCH_STAFF_INVITE,
    });

    return branchDecision.allowed;
  }
}
