import { ApiProperty } from '@nestjs/swagger';

import type { AssignRoleResult } from '../../../application/commands/assign-role/assign-role.command.js';

export class AssignRoleResponseDto {
  @ApiProperty({
    description: 'Identifier of the created Role Assignment.',
    example: 'assignment-id',
  })
  assignmentId!: string;

  static from(result: AssignRoleResult): AssignRoleResponseDto {
    return {
      assignmentId: result.assignmentId,
    };
  }
}
