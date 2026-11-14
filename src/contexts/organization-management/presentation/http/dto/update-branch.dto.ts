import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class UpdateBranchDto {
  @ApiPropertyOptional({
    description: 'Branch name in Persian.',
    example: 'شعبه جدید ونک',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  nameFa?: string;

  @ApiPropertyOptional({
    description: 'Branch name in English.',
    example: 'New Vanak Branch',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  nameEn?: string | null;

  @ApiPropertyOptional({
    description: 'Branch phone number.',
    example: '+982188888888',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @ApiPropertyOptional({
    description: 'Branch address in Persian.',
    example: 'تهران، میدان ونک',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  addressFa?: string;

  @ApiPropertyOptional({
    description: 'Branch address in English.',
    example: 'Vanak Square, Tehran',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  addressEn?: string | null;

  @ApiPropertyOptional({
    description: 'City name in Persian.',
    example: 'تهران',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  cityFa?: string;

  @ApiPropertyOptional({
    description: 'City name in English.',
    example: 'Tehran',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  cityEn?: string | null;

  @ApiPropertyOptional({
    description: 'Postal code.',
    example: '1998765432',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code.',
    example: 'IR',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  countryCode?: string;

  @ApiPropertyOptional({
    description: 'Branch latitude.',
    example: 35.7575,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @ApiPropertyOptional({
    description: 'Branch longitude.',
    example: 51.4106,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @ApiPropertyOptional({
    description: 'IANA time zone identifier.',
    example: 'Asia/Tehran',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  timeZoneId?: string;
}
