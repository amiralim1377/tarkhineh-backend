import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  PERMISSION_CODE,
  type PermissionCode,
} from '../../../domain/permissions/permission-catalog.js';
import {
  ROLE_ASSIGNMENT_TARGET,
  type RoleAssignmentTarget,
} from '../../../domain/roles/role.types.js';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Unique code of the Role within the Organization.',
    example: 'SALES_MANAGER',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'Display name of the Role.',
    example: 'Sales Manager',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the Role.',
    example: 'Manages sales operations.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({
    description: 'Assignment target of the Role.',
    enum: Object.values(ROLE_ASSIGNMENT_TARGET),
    enumName: 'RoleAssignmentTarget',
    example: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
  })
  @IsIn(Object.values(ROLE_ASSIGNMENT_TARGET))
  assignmentTarget!: RoleAssignmentTarget;

  @ApiProperty({
    description: 'Permission codes assigned to the Role.',
    enum: Object.values(PERMISSION_CODE),
    isArray: true,
    example: [
      PERMISSION_CODE.ORGANIZATION_READ,
      PERMISSION_CODE.ORGANIZATION_MEMBERS_READ,
    ],
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(PERMISSION_CODE), { each: true })
  permissionCodes!: PermissionCode[];
}
