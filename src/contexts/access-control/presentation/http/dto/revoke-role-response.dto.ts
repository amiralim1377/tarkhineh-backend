import { ApiProperty } from '@nestjs/swagger';
import type { RevokeRoleResult } from '../../../application/commands/revoke-role/revoke-role.command.js';

export class RevokeRoleResponseDto {
  @ApiProperty({
    description: 'Identifier of the revoked Role assignment.',
    example: '3d2ffcd7-ffa1-4d3d-829c-4b04b4e2b827',
  })
  assignmentId!: string;

  static from(result: RevokeRoleResult): RevokeRoleResponseDto {
    return {
      assignmentId: result.assignmentId,
    };
  }
}
