import { ApiProperty } from '@nestjs/swagger';

import {
  PERMISSION_CODE,
  type PermissionCode,
} from '../../../domain/permissions/permission-catalog.js';

export class GetEffectivePermissionsResponseDto {
  @ApiProperty({
    description:
      'Permission codes effectively granted to the authenticated user.',
    enum: Object.values(PERMISSION_CODE),
    enumName: 'PermissionCode',
    isArray: true,
    example: [
      PERMISSION_CODE.ORGANIZATION_READ,
      PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
      PERMISSION_CODE.BRANCH_STAFF_READ,
    ],
  })
  permissionCodes!: PermissionCode[];

  static from(
    permissionCodes: readonly PermissionCode[],
  ): GetEffectivePermissionsResponseDto {
    return {
      permissionCodes: [...permissionCodes],
    };
  }
}
