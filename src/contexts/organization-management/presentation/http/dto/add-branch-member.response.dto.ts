import { ApiProperty } from '@nestjs/swagger';

export class AddBranchMemberResponseDto {
  @ApiProperty({
    description: 'The ID of the created branch membership.',
    example: 'cm8x7k2p90001abc123def456',
  })
  branchMembershipId!: string;

  static from(result: {
    readonly branchMembershipId: string;
  }): AddBranchMemberResponseDto {
    const response = new AddBranchMemberResponseDto();

    response.branchMembershipId = result.branchMembershipId;

    return response;
  }
}
