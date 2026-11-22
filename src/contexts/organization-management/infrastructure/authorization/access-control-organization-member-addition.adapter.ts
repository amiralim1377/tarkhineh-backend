import { Inject, Injectable } from '@nestjs/common';
import {
  ACCESS_CONTROL_AUTHORIZATION,
  type AccessControlAuthorization,
} from '../../../access-control/contracts/authorization.contract.js';

import { PERMISSION_CODE } from '../../../access-control/contracts/permission-codes.contract.js';

import {
  ORGANIZATION_MEMBER_ADDITION_AUTHORIZATION_PORT,
  type OrganizationMemberAdditionAuthorizationPort,
} from '../../application/ports/organization-member-addition-authorization.port.js';

@Injectable()
export class AccessControlOrganizationMemberAdditionAuthorizationAdapter implements OrganizationMemberAdditionAuthorizationPort {
  constructor(
    @Inject(ACCESS_CONTROL_AUTHORIZATION)
    private readonly authorization: AccessControlAuthorization,
  ) {}

  async canAddOrganizationMember(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<boolean> {
    const decision = await this.authorization.checkPermission({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      permissionCode: PERMISSION_CODE.ORGANIZATION_MEMBERS_ADD,
    });

    return decision.allowed;
  }
}
