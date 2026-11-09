import { Inject, Injectable } from '@nestjs/common';
import {
  ACCESS_CONTROL_AUTHORIZATION,
  type AccessControlAuthorization,
} from '../../../access-control/contracts/authorization.contract.js';
import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';
import type { BranchCreationAuthorizationPort } from '../../application/ports/branch-creation-authorization.port.js';

@Injectable()
export class AccessControlBranchCreationAuthorizationAdapter implements BranchCreationAuthorizationPort {
  constructor(
    @Inject(ACCESS_CONTROL_AUTHORIZATION)
    private readonly authorization: AccessControlAuthorization,
  ) {}

  async canCreateBranch(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<boolean> {
    const decision = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      permissionCode: PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE,
    });

    return decision.allowed;
  }
}
