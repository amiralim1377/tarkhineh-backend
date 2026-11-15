import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class AssignRoleDto {
  @ApiPropertyOptional({
    description:
      'Organization membership identifier. Supply this field for an Organization-level Role assignment.',
    example: 'organization-membership-id',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  organizationMembershipId?: string;

  @ApiPropertyOptional({
    description:
      'Branch membership identifier. Required together with branchId for a Branch-level Role assignment.',
    example: 'branch-membership-id',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  branchMembershipId?: string;

  @ApiPropertyOptional({
    description:
      'Branch identifier. Required together with branchMembershipId for a Branch-level Role assignment.',
    example: 'branch-id',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
