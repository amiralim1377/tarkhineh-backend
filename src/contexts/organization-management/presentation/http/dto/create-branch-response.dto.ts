import { ApiProperty } from '@nestjs/swagger';
import type { CreateBranchResult } from '../../../application/commands/create-branch/create-branch.command.js';

export class CreateBranchResponseDto {
  @ApiProperty({
    description: 'Identifier of the newly created Branch.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  branchId!: string;

  static from(result: CreateBranchResult): CreateBranchResponseDto {
    const response = new CreateBranchResponseDto();

    response.branchId = result.branchId;

    return response;
  }
}
