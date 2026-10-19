import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterWithEmailDto {
  @ApiProperty({
    description: 'Email address used to register the account.',
    example: 'user@example.com',
    maxLength: 254,
    format: 'email',
  })
  @IsEmail()
  @MaxLength(254, {
    context: {
      publicParams: { max: 254 },
    },
  })
  email!: string;

  @ApiProperty({
    description: 'Password for the new account.',
    example: 'StrongPassword123!',
    format: 'password',
    writeOnly: true,
    minLength: 8,
    maxLength: 1024,
  })
  @IsString()
  @MinLength(8, {
    context: {
      publicParams: { min: 8 },
    },
  })
  @MaxLength(1024, {
    context: {
      publicParams: { max: 1024 },
    },
  })
  password!: string;

  @ApiPropertyOptional({
    description: 'Optional display name for the user.',
    example: 'Alex Morgan',
    maxLength: 100,
    nullable: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, {
    context: {
      publicParams: { max: 100 },
    },
  })
  displayName?: string;
}
