import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'The current account password.',
    format: 'password',
    writeOnly: true,
    minLength: 1,
    maxLength: 1024,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  currentPassword!: string;

  @ApiProperty({
    description: 'The new account password.',
    format: 'password',
    writeOnly: true,
    minLength: 8,
    maxLength: 1024,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  newPassword!: string;

  @ApiProperty({
    description: 'Must match newPassword.',
    format: 'password',
    writeOnly: true,
    minLength: 8,
    maxLength: 1024,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  confirmNewPassword!: string;
}
