import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GetEffectivePermissionsDto {
  @ApiPropertyOptional({
    description:
      'Optional Branch identifier. When omitted, only Organization-level permissions are evaluated.',
    example: 'branch-id',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
