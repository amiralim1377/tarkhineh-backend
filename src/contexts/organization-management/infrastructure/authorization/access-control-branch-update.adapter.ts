import { Inject, Injectable } from '@nestjs/common';

import {
  ACCESS_CONTROL_AUTHORIZATION,
  type AccessControlAuthorization,
} from '../../../access-control/contracts/authorization.contract.js';

import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';

import type { BranchUpdateAuthorizationPort } from '../../application/ports/branch-update-authorization.port.js';

@Injectable()
export class AccessControlBranchUpdateAuthorizationAdapter implements BranchUpdateAuthorizationPort {
  constructor(
    @Inject(ACCESS_CONTROL_AUTHORIZATION)
    private readonly authorization: AccessControlAuthorization,
  ) {}

  async canUpdateBranch(input: {
    actorUserId: string;
    organizationId: string;
    branchId: string;
  }): Promise<boolean> {
    const organizationDecision = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      permissionCode: PERMISSION_CODE.ORGANIZATION_BRANCHES_UPDATE,
    });

    if (organizationDecision.allowed) {
      return true;
    }

    const branchDecision = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      permissionCode: PERMISSION_CODE.BRANCH_PROFILE_UPDATE,
    });

    return branchDecision.allowed;
  }
}
