import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterWithEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(1024)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}
