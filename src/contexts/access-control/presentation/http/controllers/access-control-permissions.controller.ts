import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
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
import { GetEffectivePermissionsQuery } from '../../../application/queries/get-effective-permissions/get-effective-permissions.query.js';
import { CheckPermissionQuery } from '../../../application/queries/check-permission/check-permission.query.js';
import { ROLE_ASSIGNMENT_TARGET } from '../../../domain/roles/role.types.js';
import { PERMISSION_CODE } from '../../../domain/permissions/permission-catalog.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { AvailablePermissionResponseDto } from '../dto/available-permission-response.dto.js';
import { ListAvailablePermissionsDto } from '../dto/list-available-permissions.dto.js';
import { GetEffectivePermissionsDto } from '../dto/get-effective-permissions.dto.js';
import { GetEffectivePermissionsResponseDto } from '../dto/get-effective-permissions-response.dto.js';
import { CheckPermissionDto } from '../dto/check-permission.dto.js';
import { CheckPermissionResponseDto } from '../dto/check-permission-response.dto.js';

@ApiTags('Access Control')
@Controller('organizations/:organizationId/access-control')
export class AccessControlPermissionsController {
  constructor(private readonly queryBus: QueryBus) {}

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
}
