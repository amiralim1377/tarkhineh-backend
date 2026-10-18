import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterWithEmailDto {
  @IsEmail()
  @MaxLength(254, {
    context: {
      publicParams: { max: 254 },
    },
  })
  email!: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(100, {
    context: {
      publicParams: { max: 100 },
    },
  })
  displayName?: string;
}
