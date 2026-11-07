import { ApiProperty } from '@nestjs/swagger';

import {
  PERMISSION_CODE,
  PERMISSION_RESOURCE,
  PERMISSION_RESOURCE_LEVEL,
  PERMISSION_ACTION,
  type PermissionDefinition,
  type PermissionCode,
  type PermissionResource,
  type PermissionResourceLevel,
  type PermissionAction,
  type LocalizedText,
} from '../../../domain/permissions/permission-catalog.js';

export class AvailablePermissionResponseDto {
  @ApiProperty({ enum: Object.values(PERMISSION_CODE) })
  code!: PermissionCode;

  @ApiProperty({ type: Object })
  name!: LocalizedText;

  @ApiProperty({ type: Object })
  description!: LocalizedText;

  @ApiProperty({ enum: Object.values(PERMISSION_RESOURCE_LEVEL) })
  resourceLevel!: PermissionResourceLevel;

  @ApiProperty({ enum: Object.values(PERMISSION_RESOURCE) })
  resource!: PermissionResource;

  @ApiProperty({ enum: Object.values(PERMISSION_ACTION) })
  action!: PermissionAction;

  @ApiProperty({ example: true })
  delegable!: boolean;

  static from(
    definition: PermissionDefinition,
  ): AvailablePermissionResponseDto {
    return {
      code: definition.code,
      name: definition.name,
      description: definition.description,
      resourceLevel: definition.resourceLevel,
      resource: definition.resource,
      action: definition.action,
      delegable: definition.delegable,
    };
  }
}
