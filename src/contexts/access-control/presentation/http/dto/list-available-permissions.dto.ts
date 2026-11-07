import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import {
  ROLE_ASSIGNMENT_TARGET,
  type RoleAssignmentTarget,
} from '../../../domain/roles/role.types.js';

export class ListAvailablePermissionsDto {
  @ApiProperty({
    description: 'Target scope of the Role being created.',
    enum: Object.values(ROLE_ASSIGNMENT_TARGET),
    enumName: 'RoleAssignmentTarget',
    example: ROLE_ASSIGNMENT_TARGET.ORGANIZATION,
  })
  @IsIn(Object.values(ROLE_ASSIGNMENT_TARGET))
  assignmentTarget!: RoleAssignmentTarget;
}
