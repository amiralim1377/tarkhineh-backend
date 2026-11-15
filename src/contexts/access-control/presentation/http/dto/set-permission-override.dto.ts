import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

import {
  PERMISSION_CODE,
  type PermissionCode,
} from '../../../domain/permissions/permission-catalog.js';

import {
  PERMISSION_OVERRIDE_EFFECT,
  type PermissionOverrideEffect,
} from '../../../domain/permission-overrides/permission-override.js';

export class SetPermissionOverrideDto {
  @ApiProperty({
    description: 'Organization membership identifier.',
    example: 'organization-membership-id',
  })
  @IsString()
  @IsNotEmpty()
  organizationMembershipId!: string;

  @ApiProperty({
    description: 'Branch identifier for this permission override.',
    example: 'branch-id',
  })
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({
    description: 'Permission code to override.',
    enum: Object.values(PERMISSION_CODE),
    enumName: 'PermissionCode',
    example: PERMISSION_CODE.BRANCH_DASHBOARD_READ,
  })
  @IsIn(Object.values(PERMISSION_CODE))
  permissionCode!: PermissionCode;

  @ApiProperty({
    description: 'Effect of the permission override.',
    enum: Object.values(PERMISSION_OVERRIDE_EFFECT),
    enumName: 'PermissionOverrideEffect',
    example: PERMISSION_OVERRIDE_EFFECT.DENY,
  })
  @IsIn(Object.values(PERMISSION_OVERRIDE_EFFECT))
  effect!: PermissionOverrideEffect;
}
