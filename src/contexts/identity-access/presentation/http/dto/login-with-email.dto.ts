import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginWithEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
