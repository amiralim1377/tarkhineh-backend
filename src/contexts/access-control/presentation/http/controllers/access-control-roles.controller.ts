import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../identity-access/presentation/http/auth/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../../../../identity-access/presentation/http/auth/contracts/authentication-strategy.js';
import { Auth } from '../../../../identity-access/presentation/http/auth/decorators/auth.decorator.js';
import { AuthType } from '../../../../identity-access/presentation/http/auth/contracts/auth-type.enum.js';
import { CreateRoleCommand } from '../../../application/commands/create-role/create-role.command.js';
import { UpdateRoleCommand } from '../../../application/commands/update-role/update-role.command.js';
import { ArchiveRoleCommand } from '../../../application/commands/archive-role/archive-role.command.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { CreateRoleDto } from '../dto/create-role.dto.js';
import { CreateRoleResponseDto } from '../dto/create-role-response.dto.js';
import { UpdateRoleDto } from '../dto/update-role.dto.js';
import { UpdateRoleResponseDto } from '../dto/update-role-response.dto.js';
import { ArchiveRoleResponseDto } from '../dto/archive-role-response.dto.js';

@ApiTags('Access Control')
@Controller('organizations/:organizationId/access-control')
export class AccessControlRolesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Post('roles')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an Organization-defined Role',
    description:
      'Creates a custom Role within the specified Organization after validating the actor authority and permission delegation rules.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiBody({
    type: CreateRoleDto,
  })
  @ApiCreatedResponse({
    description: 'Role created successfully.',
    type: CreateRoleResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to create this Role.',
  })
  @ApiProblemResponse(HttpStatus.CONFLICT, {
    description: 'A Role with the supplied code already exists.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Role configuration violates a business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async createRole(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateRoleDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<CreateRoleResponseDto> {
    const result = await this.commandBus.execute(
      new CreateRoleCommand(principal.userId, {
        organizationId,
        code: body.code,
        name: body.name,
        ...(body.description === undefined
          ? {}
          : { description: body.description }),
        assignmentTarget: body.assignmentTarget,
        permissionCodes: body.permissionCodes,
      }),
    );

    return CreateRoleResponseDto.from(result);
  }

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Patch('roles/:roleId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update an Organization-defined Role',
    description:
      'Updates the details or complete Permission set of an existing Organization-defined Role.',
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
    type: UpdateRoleDto,
  })
  @ApiOkResponse({
    description: 'Role updated successfully.',
    type: UpdateRoleResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to update this Role.',
  })
  @ApiProblemResponse(HttpStatus.NOT_FOUND, {
    description: 'The requested Role was not found in this Organization.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Role update violates a business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async updateRole(
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Body() body: UpdateRoleDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<UpdateRoleResponseDto> {
    const result = await this.commandBus.execute(
      new UpdateRoleCommand(principal.userId, {
        organizationId,
        roleId,
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.description === undefined
          ? {}
          : { description: body.description }),
        ...(body.permissionCodes === undefined
          ? {}
          : { permissionCodes: body.permissionCodes }),
      }),
    );

    return UpdateRoleResponseDto.from(result);
  }

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Patch('roles/:roleId/archive')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive an Organization-defined Role',
    description:
      'Archives an existing Organization-defined Role without deleting its record or historical assignments.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiParam({
    name: 'roleId',
    description: 'The Role identifier.',
  })
  @ApiOkResponse({
    description: 'Role archived successfully.',
    type: ArchiveRoleResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request parameters are invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to archive this Role.',
  })
  @ApiProblemResponse(HttpStatus.NOT_FOUND, {
    description: 'The requested Organization-defined Role was not found.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async archiveRole(
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<ArchiveRoleResponseDto> {
    const result = await this.commandBus.execute(
      new ArchiveRoleCommand(principal.userId, {
        organizationId,
        roleId,
      }),
    );

    return ArchiveRoleResponseDto.from(result);
  }
}
