import { ApiProperty } from '@nestjs/swagger';
import type { AuthorizationDecision } from '../../../domain/authorization/authorization-decision.js';
import type { PermissionCode } from '../../../domain/permissions/permission-catalog.js';

export class CheckPermissionResponseDto {
  @ApiProperty({
    description: 'The permission code that was evaluated.',
    example: 'branch.staff.read',
  })
  permissionCode!: PermissionCode;

  @ApiProperty({
    description:
      'Indicates whether the authenticated user is allowed to perform the requested action.',
    example: true,
  })
  allowed!: boolean;

  static from(
    permissionCode: PermissionCode,
    decision: AuthorizationDecision,
  ): CheckPermissionResponseDto {
    return {
      permissionCode,
      allowed: decision.isAllowed(),
    };
  }
}
