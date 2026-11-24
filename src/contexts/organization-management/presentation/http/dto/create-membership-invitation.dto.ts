import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../../domain/types/membership-invitation-scope.js';
import type { MembershipInvitationScope } from '../../../domain/types/membership-invitation-scope.js';

interface MembershipInvitationScopeValidationInput {
  readonly branchId?: unknown;
}

@ValidatorConstraint({
  name: 'membershipInvitationScopeBranchId',
  async: false,
})
class MembershipInvitationScopeBranchIdConstraint implements ValidatorConstraintInterface {
  validate(scope: unknown, args: ValidationArguments): boolean {
    const input = args.object as MembershipInvitationScopeValidationInput;

    if (scope === MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION) {
      return input.branchId === undefined;
    }

    if (scope === MEMBERSHIP_INVITATION_SCOPE.BRANCH) {
      return (
        typeof input.branchId === 'string' && input.branchId.trim().length > 0
      );
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    if (args.value === MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION) {
      return 'branchId must not be provided for an organization invitation.';
    }

    return 'branchId is required for a branch invitation.';
  }
}

export class CreateMembershipInvitationDto {
  @ApiProperty({
    description: 'Email address of the invited user.',
    example: 'employee@example.com',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @Matches(/\S/, {
    message: 'email must not be empty.',
  })
  email!: string;

  @ApiProperty({
    description: 'Scope of the membership invitation.',
    enum: Object.values(MEMBERSHIP_INVITATION_SCOPE),
    example: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
  })
  @IsIn(Object.values(MEMBERSHIP_INVITATION_SCOPE))
  @Validate(MembershipInvitationScopeBranchIdConstraint)
  scope!: MembershipInvitationScope;

  @ApiPropertyOptional({
    description:
      'Required for BRANCH scope and must be omitted for ORGANIZATION scope.',
    example: 'branch-123',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf(
    (input: CreateMembershipInvitationDto) =>
      input.scope === MEMBERSHIP_INVITATION_SCOPE.BRANCH,
  )
  @IsDefined({
    message: 'branchId is required for a branch invitation.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'branchId must not be empty.',
  })
  branchId?: string;
}
