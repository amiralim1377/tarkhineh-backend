import { ApiProperty } from '@nestjs/swagger';

import type { CreateRoleResult } from '../../../application/commands/create-role/create-role.command.js';

export class CreateRoleResponseDto {
  @ApiProperty({
    description: 'Identifier of the newly created Role.',
    example: 'cmvweuweq000i4l1dtx2fftts',
  })
  roleId!: string;

  static from(result: CreateRoleResult): CreateRoleResponseDto {
    return {
      roleId: result.roleId,
    };
  }
}
