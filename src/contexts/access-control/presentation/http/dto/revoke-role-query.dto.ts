import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RevokeRoleQueryDto {
  @ApiPropertyOptional({
    description:
      'Required when revoking a Branch-level assignment. Omit for an Organization-level assignment.',
    example: 'branch-id',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
