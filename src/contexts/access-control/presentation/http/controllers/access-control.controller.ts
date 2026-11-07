import { Controller, Get, Param, Query } from '@nestjs/common';
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
import { ROLE_ASSIGNMENT_TARGET } from '../../../domain/roles/role.types.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { AvailablePermissionResponseDto } from '../dto/available-permission-response.dto.js';
import { ListAvailablePermissionsDto } from '../dto/list-available-permissions.dto.js';

@ApiTags('Access Control')
@Controller('organizations/:organizationId/access-control')
export class AccessControlController {
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
}
