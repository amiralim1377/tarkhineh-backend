import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddBranchMemberRequestDto {
  @ApiProperty({
    description: 'The ID of the existing user to add to the branch.',
    example: 'cm8x7k2p90001abc123def456',
  })
  @IsString()
  @IsNotEmpty()
  memberUserId!: string;
}
