import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    description: 'Branch name in Persian.',
    example: 'شعبه ونک',
  })
  @IsString()
  @IsNotEmpty()
  nameFa!: string;

  @ApiPropertyOptional({
    description: 'Branch name in English.',
    example: 'Vanak Branch',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  nameEn?: string | null;

  @ApiProperty({
    description: 'Unique URL-friendly slug within the Organization.',
    example: 'vanak',
  })
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional({
    description: 'Branch phone number.',
    example: '+982188888888',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @ApiProperty({
    description: 'Branch address in Persian.',
    example: 'تهران، میدان ونک، خیابان ملاصدرا',
  })
  @IsString()
  @IsNotEmpty()
  addressFa!: string;

  @ApiPropertyOptional({
    description: 'Branch address in English.',
    example: 'Mollasadra Street, Vanak Square, Tehran',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  addressEn?: string | null;

  @ApiProperty({
    description: 'City name in Persian.',
    example: 'تهران',
  })
  @IsString()
  @IsNotEmpty()
  cityFa!: string;

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

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code.',
    example: 'IR',
  })
  @IsString()
  @IsNotEmpty()
  countryCode!: string;

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

  @ApiProperty({
    description: 'IANA time zone identifier.',
    example: 'Asia/Tehran',
  })
  @IsString()
  @IsNotEmpty()
  timeZoneId!: string;
}
