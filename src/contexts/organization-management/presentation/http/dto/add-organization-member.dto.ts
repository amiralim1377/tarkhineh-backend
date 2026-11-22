import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AddOrganizationMemberDto {
  @ApiProperty({
    description: 'ID of the existing user to add to the organization.',
    example: '60d032cc-9abe-4b70-a50b-fcc54f5a317e',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'memberUserId must not be empty.',
  })
  memberUserId!: string;
}
