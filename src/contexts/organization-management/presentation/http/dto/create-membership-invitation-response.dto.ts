import { ApiProperty } from '@nestjs/swagger';
import type { CreateMembershipInvitationResult } from '../../../application/commands/create-membership-invitation/create-membership-invitation.command.js';

export class CreateMembershipInvitationResponseDto {
  @ApiProperty({
    description: 'ID of the created membership invitation.',
    example: 'invitation-123',
  })
  readonly membershipInvitationId: string;

  private constructor(result: CreateMembershipInvitationResult) {
    this.membershipInvitationId = result.membershipInvitationId;
  }

  static from(
    result: CreateMembershipInvitationResult,
  ): CreateMembershipInvitationResponseDto {
    return new CreateMembershipInvitationResponseDto(result);
  }
}
