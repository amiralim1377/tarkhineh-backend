import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The recovery token received in the password reset email.',
    example: 'secure-recovery-token',
  })
  @IsString()
  @IsNotEmpty()
  readonly recoveryToken!: string;

  @ApiProperty({
    description: 'The new password for the account.',
    example: 'NewSecurePassword123',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  readonly newPassword!: string;
}
