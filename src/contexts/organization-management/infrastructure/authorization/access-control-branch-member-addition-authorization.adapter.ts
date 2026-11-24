import { Inject, Injectable } from '@nestjs/common';
import {
  ACCESS_CONTROL_AUTHORIZATION,
  type AccessControlAuthorization,
} from '../../../access-control/contracts/authorization.contract.js';
import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';
import type { BranchMemberAdditionAuthorizationPort } from '../../application/ports/branch-member-addition-authorization.port.js';

@Injectable()
export class AccessControlBranchMemberAdditionAuthorizationAdapter implements BranchMemberAdditionAuthorizationPort {
  constructor(
    @Inject(ACCESS_CONTROL_AUTHORIZATION)
    private readonly authorization: AccessControlAuthorization,
  ) {}

  async canAddBranchMember(input: {
    actorUserId: string;
    organizationId: string;
    branchId: string;
  }): Promise<boolean> {
    const organizationAuthorization = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_ADD,
    });

    if (organizationAuthorization.allowed) {
      return true;
    }

    const branchAuthorization = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      permissionCode: PERMISSION_CODE.BRANCH_STAFF_ADD,
    });

    return branchAuthorization.allowed;
  }
}
