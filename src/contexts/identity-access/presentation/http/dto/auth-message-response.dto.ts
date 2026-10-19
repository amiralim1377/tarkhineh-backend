import { ApiProperty } from '@nestjs/swagger';

export class AuthMessageResponseDto {
  @ApiProperty({
    description: 'Human-readable result message.',
    example: 'Email verified successfully.',
  })
  readonly message!: string;
}
