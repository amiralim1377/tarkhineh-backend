import { ApiProperty } from '@nestjs/swagger';

export class CurrentUserResponseDto {
  @ApiProperty({
    description: 'Identifier of the authenticated user.',
  })
  userId!: string;
}
