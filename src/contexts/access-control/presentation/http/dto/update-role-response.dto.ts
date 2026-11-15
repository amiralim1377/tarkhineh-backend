import { ApiProperty } from '@nestjs/swagger';

import type { UpdateRoleResult } from '../../../application/commands/update-role/update-role.command.js';

export class UpdateRoleResponseDto {
  @ApiProperty({
    description: 'Identifier of the updated Role.',
    example: 'c24c40f3-3f29-4948-be72-db4b9d8b2f48',
  })
  roleId!: string;

  static from(result: UpdateRoleResult): UpdateRoleResponseDto {
    return {
      roleId: result.roleId,
    };
  }
}
