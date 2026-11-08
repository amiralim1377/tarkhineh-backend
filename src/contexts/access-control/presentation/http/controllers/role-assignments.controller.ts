import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../identity-access/presentation/http/auth/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../../../../identity-access/presentation/http/auth/contracts/authentication-strategy.js';
import { Auth } from '../../../../identity-access/presentation/http/auth/decorators/auth.decorator.js';
import { AuthType } from '../../../../identity-access/presentation/http/auth/contracts/auth-type.enum.js';
import { AssignRoleCommand } from '../../../application/commands/assign-role/assign-role.command.js';
import { RevokeRoleCommand } from '../../../application/commands/revoke-role/revoke-role.command.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { AssignRoleDto } from '../dto/assign-role.dto.js';
import { AssignRoleResponseDto } from '../dto/assign-role-response.dto.js';
import { RevokeRoleQueryDto } from '../dto/revoke-role-query.dto.js';
import { RevokeRoleResponseDto } from '../dto/revoke-role-response.dto.js';

@ApiTags('Access Control')
@Controller('organizations/:organizationId/access-control')
export class RoleAssignmentsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Post('roles/:roleId/assignments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Assign a Role to an Organization or Branch membership',
    description:
      'Assigns an active, assignable Role to an active Organization or Branch membership after validating authorization and delegation rules.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiParam({
    name: 'roleId',
    description: 'The Role identifier.',
  })
  @ApiBody({
    type: AssignRoleDto,
  })
  @ApiCreatedResponse({
    description: 'Role assigned successfully.',
    type: AssignRoleResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to assign this Role.',
  })
  @ApiProblemResponse(HttpStatus.NOT_FOUND, {
    description:
      'The Role or target membership was not found in this Organization.',
  })
  @ApiProblemResponse(HttpStatus.CONFLICT, {
    description: 'This Role is already assigned to the target membership.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Role assignment violates a business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async assignRole(
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Body() body: AssignRoleDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<AssignRoleResponseDto> {
    const result = await this.commandBus.execute(
      new AssignRoleCommand(principal.userId, {
        organizationId,
        roleId,
        ...(body.organizationMembershipId === undefined
          ? {}
          : { organizationMembershipId: body.organizationMembershipId }),
        ...(body.branchMembershipId === undefined
          ? {}
          : { branchMembershipId: body.branchMembershipId }),
        ...(body.branchId === undefined ? {} : { branchId: body.branchId }),
      }),
    );

    return AssignRoleResponseDto.from(result);
  }

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Patch('assignments/:assignmentId/revoke')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke a Role assignment',
    description:
      'Revokes an existing Role assignment from an Organization or Branch membership without deleting its historical record.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'The Role assignment identifier.',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description:
      'Required when revoking a Branch-level assignment. Omit for an Organization-level assignment.',
  })
  @ApiOkResponse({
    description: 'Role assignment revoked successfully.',
    type: RevokeRoleResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request parameters are invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor does not have authority to revoke this assignment.',
  })
  @ApiProblemResponse(HttpStatus.NOT_FOUND, {
    description:
      'The requested Role assignment was not found in the specified target.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Role assignment revocation violates a business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async revokeRole(
    @Param('organizationId') organizationId: string,
    @Param('assignmentId') assignmentId: string,
    @Query() query: RevokeRoleQueryDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<RevokeRoleResponseDto> {
    const result = await this.commandBus.execute(
      new RevokeRoleCommand(principal.userId, {
        organizationId,
        assignmentId,
        ...(query.branchId === undefined ? {} : { branchId: query.branchId }),
      }),
    );

    return RevokeRoleResponseDto.from(result);
  }
}
