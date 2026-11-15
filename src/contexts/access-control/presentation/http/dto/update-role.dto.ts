import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

import {
  PERMISSION_CODE,
  type PermissionCode,
} from '../../../domain/permissions/permission-catalog.js';

export class UpdateRoleDto {
  @ApiPropertyOptional({
    description: 'New display name of the Role.',
    example: 'Sales Director',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description:
      'New description of the Role. Send null to clear the existing description.',
    example: 'Manages the sales department.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    description:
      'Complete replacement Permission set. Send an empty array to remove all Permissions.',
    enum: Object.values(PERMISSION_CODE),
    isArray: true,
    example: [
      PERMISSION_CODE.ORGANIZATION_READ,
      PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
      PERMISSION_CODE.ORGANIZATION_ROLES_READ,
    ],
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(PERMISSION_CODE), { each: true })
  permissionCodes?: PermissionCode[];
}
