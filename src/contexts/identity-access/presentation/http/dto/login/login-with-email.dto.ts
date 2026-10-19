import {
  ApiProperty,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginWithEmailDto {
  @ApiProperty({
    description: 'Email address associated with the account.',
    example: 'user@example.com',
    format: 'email',
    maxLength: 254,
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description: 'Account password.',
    example: 'StrongPassword123!',
    format: 'password',
    writeOnly: true,
    minLength: 1,
    maxLength: 1024,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
