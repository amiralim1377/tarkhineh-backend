import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import {
  PERMISSION_CODE,
  type PermissionCode,
} from '../../../domain/permissions/permission-catalog.js';

export class CheckPermissionDto {
  @ApiProperty({
    description: 'Permission code to evaluate.',
    enum: Object.values(PERMISSION_CODE),
    enumName: 'PermissionCode',
    example: PERMISSION_CODE.BRANCH_STAFF_READ,
  })
  @IsIn(Object.values(PERMISSION_CODE))
  permissionCode!: PermissionCode;

  @ApiPropertyOptional({
    description:
      'Optional Branch identifier. Required when checking a Branch-level permission.',
    example: 'branch-id',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
