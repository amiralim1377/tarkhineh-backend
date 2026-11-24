import { ApiProperty } from '@nestjs/swagger';
import type { AddOrganizationMemberResult } from '../../../application/commands/add-organization-member/add-organization-member.command.js';

export class AddOrganizationMemberResponseDto {
  @ApiProperty({
    description: 'ID of the created organization membership.',
    example: 'membership-123',
  })
  readonly organizationMembershipId: string;

  private constructor(result: AddOrganizationMemberResult) {
    this.organizationMembershipId = result.organizationMembershipId;
  }

  static from(
    result: AddOrganizationMemberResult,
  ): AddOrganizationMemberResponseDto {
    return new AddOrganizationMemberResponseDto(result);
  }
}
