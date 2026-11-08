import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
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
import { ListAvailablePermissionsQuery } from '../../../application/queries/list-available-permissions/list-available-permissions.query.js';
import { ROLE_ASSIGNMENT_TARGET } from '../../../domain/roles/role.types.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { AvailablePermissionResponseDto } from '../dto/available-permission-response.dto.js';
import { ListAvailablePermissionsDto } from '../dto/list-available-permissions.dto.js';
import { GetEffectivePermissionsDto } from '../dto/get-effective-permissions.dto.js';
import { GetEffectivePermissionsResponseDto } from '../dto/get-effective-permissions-response.dto.js';
import { GetEffectivePermissionsQuery } from '../../../application/queries/get-effective-permissions/get-effective-permissions.query.js';
import { CheckPermissionDto } from '../dto/check-permission.dto.js';
import { CheckPermissionResponseDto } from '../dto/check-permission-response.dto.js';
import { CheckPermissionQuery } from '../../../application/queries/check-permission/check-permission.query.js';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import { CreateRoleDto } from '../dto/create-role.dto.js';
import { CreateRoleResponseDto } from '../dto/create-role-response.dto.js';
import { CreateRoleCommand } from '../../../application/commands/create-role/create-role.command.js';
import { UpdateRoleDto } from '../dto/update-role.dto.js';
import { UpdateRoleCommand } from '../../../application/commands/update-role/update-role.command.js';
import { UpdateRoleResponseDto } from '../dto/update-role-response.dto.js';
import { ArchiveRoleResponseDto } from '../dto/archive-role-response.dto.js';
import { ArchiveRoleCommand } from '../../../application/commands/archive-role/archive-role.command.js';

@ApiTags('Access Control')
@Controller('organizations/:organizationId/access-control')
export class AccessControlController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Get('available-permissions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List available permissions for a custom Role',
    description:
      'Returns permissions that the authenticated actor is allowed to delegate into a custom Role.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiQuery({
    name: 'assignmentTarget',
    required: true,
    enum: Object.values(ROLE_ASSIGNMENT_TARGET),
  })
  @ApiOkResponse({
    description: 'Available permissions returned successfully.',
    type: AvailablePermissionResponseDto,
    isArray: true,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request parameters are invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'A valid bearer access token is required.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async listAvailablePermissions(
    @Param('organizationId') organizationId: string,
    @Query() query: ListAvailablePermissionsDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<AvailablePermissionResponseDto[]> {
    const permissions = await this.queryBus.execute(
      new ListAvailablePermissionsQuery({
        userId: principal.userId,
        organizationId,
        assignmentTarget: query.assignmentTarget,
      }),
    );

    return permissions.map((permission) =>
      AvailablePermissionResponseDto.from(permission),
    );
  }

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Get('effective-permissions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get effective permissions of the authenticated user',
    description:
      'Returns the permissions effectively granted to the authenticated user within an Organization or an optional Branch context.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description:
      'Optional Branch identifier. When provided, Organization-level and Branch-level permissions are evaluated within this Branch context.',
  })
  @ApiOkResponse({
    description: 'Effective permissions returned successfully.',
    type: GetEffectivePermissionsResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request parameters are invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async getEffectivePermissions(
    @Param('organizationId') organizationId: string,
    @Query() query: GetEffectivePermissionsDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<GetEffectivePermissionsResponseDto> {
    const permissionCodes = await this.queryBus.execute(
      new GetEffectivePermissionsQuery({
        userId: principal.userId,
        organizationId,
        ...(query.branchId === undefined ? {} : { branchId: query.branchId }),
      }),
    );

    return GetEffectivePermissionsResponseDto.from(permissionCodes);
  }

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Get('check-permission')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check a specific permission of the authenticated user',
    description:
      'Evaluates whether the authenticated user has a specific permission within an Organization or an optional Branch context.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiQuery({
    name: 'permissionCode',
    required: true,
    enum: Object.values(PERMISSION_CODE),
    enumName: 'PermissionCode',
    description: 'The permission code to evaluate.',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description:
      'Optional Branch identifier. Required when evaluating a Branch-level permission.',
  })
  @ApiOkResponse({
    description: 'Permission evaluation completed successfully.',
    type: CheckPermissionResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request parameters are invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async checkPermission(
    @Param('organizationId') organizationId: string,
    @Query() query: CheckPermissionDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<CheckPermissionResponseDto> {
    const decision = await this.queryBus.execute(
      new CheckPermissionQuery({
        userId: principal.userId,
        organizationId,
        permissionCode: query.permissionCode,
        ...(query.branchId === undefined ? {} : { branchId: query.branchId }),
      }),
    );

    return CheckPermissionResponseDto.from(query.permissionCode, decision);
  }

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
