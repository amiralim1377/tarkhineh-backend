import { ApiProperty } from '@nestjs/swagger';
import type { UpdateBranchResult } from '../../../application/commands/update-branch/update-branch.command.js';

export class UpdateBranchResponseDto {
  @ApiProperty({
    description: 'Identifier of the updated Branch.',
    example: 'e200f3ae-4a3a-4692-a4a3-d45553d622c5',
  })
  branchId!: string;

  static from(result: UpdateBranchResult): UpdateBranchResponseDto {
    const response = new UpdateBranchResponseDto();

    response.branchId = result.branchId;

    return response;
  }
}
