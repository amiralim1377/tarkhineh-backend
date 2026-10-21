import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'The email address associated with the account.',
    example: 'user@example.com',
  })
  @IsEmail()
  readonly email!: string;
}
