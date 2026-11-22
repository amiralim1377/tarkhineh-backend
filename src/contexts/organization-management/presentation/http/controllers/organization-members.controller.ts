import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AddOrganizationMemberCommand } from '../../../application/commands/add-organization-member/add-organization-member.command.js';
import type { AddOrganizationMemberResult } from '../../../application/commands/add-organization-member/add-organization-member.command.js';
import { AddOrganizationMemberDto } from '../dto/add-organization-member.dto.js';
import { AddOrganizationMemberResponseDto } from '../dto/add-organization-member-response.dto.js';
import { CurrentUser } from '../../../../identity-access/presentation/http/auth/decorators/current-user.decorator.js';

@ApiTags('Organization Members')
@ApiBearerAuth()
@Controller('organizations/:organizationId/members')
export class OrganizationMembersController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an existing user to an organization',
    description:
      'Directly adds an existing active user as an active member of the organization.',
  })
  @ApiCreatedResponse({
    description: 'Organization member successfully added.',
    type: AddOrganizationMemberResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid request data.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiForbiddenResponse({
    description: 'The actor is not allowed to add organization members.',
  })
  @ApiNotFoundResponse({
    description: 'Organization or user not found.',
  })
  @ApiConflictResponse({
    description:
      'Organization is suspended, user is not active, or membership already exists.',
  })
  async addOrganizationMember(
    @Param('organizationId') organizationId: string,
    @Body() body: AddOrganizationMemberDto,
    @CurrentUser() principal: { userId: string },
  ): Promise<AddOrganizationMemberResponseDto> {
    const result = await this.commandBus.execute<AddOrganizationMemberResult>(
      new AddOrganizationMemberCommand(
        principal.userId,
        organizationId,
        body.memberUserId,
      ),
    );

    return AddOrganizationMemberResponseDto.from(result);
  }
}
