import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../identity-access/presentation/http/auth/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../../../../identity-access/presentation/http/auth/contracts/authentication-strategy.js';
import { Auth } from '../../../../identity-access/presentation/http/auth/decorators/auth.decorator.js';
import { AuthType } from '../../../../identity-access/presentation/http/auth/contracts/auth-type.enum.js';
import { SetPermissionOverrideCommand } from '../../../application/commands/set-permission-override/set-permission-override.command.js';
import { RemovePermissionOverrideCommand } from '../../../application/commands/remove-permission-override/remove-permission-override.command.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';
import { SetPermissionOverrideDto } from '../dto/set-permission-override.dto.js';
import { SetPermissionOverrideResponseDto } from '../dto/set-permission-override-response.dto.js';
import { RemovePermissionOverrideResponseDto } from '../dto/remove-permission-override-response.dto.js';

@ApiTags('Access Control')
@Controller('organizations/:organizationId/access-control')
export class PermissionOverridesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Put('permission-overrides')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set a Permission Override',
    description:
      'Creates a Branch-specific Permission Override or changes the effect of an existing one.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiBody({
    type: SetPermissionOverrideDto,
  })
  @ApiOkResponse({
    description: 'Permission Override successfully set.',
    type: SetPermissionOverrideResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to set this Permission Override.',
  })
  @ApiProblemResponse(HttpStatus.NOT_FOUND, {
    description:
      'The Organization, membership, or Branch target was not found or is inactive.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Permission Override violates a business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async setPermissionOverride(
    @Param('organizationId') organizationId: string,
    @Body() body: SetPermissionOverrideDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<SetPermissionOverrideResponseDto> {
    const result = await this.commandBus.execute(
      new SetPermissionOverrideCommand(principal.userId, {
        organizationId,
        organizationMembershipId: body.organizationMembershipId,
        branchId: body.branchId,
        permissionCode: body.permissionCode,
        effect: body.effect,
      }),
    );

    return SetPermissionOverrideResponseDto.from(result);
  }

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Delete(
    'permission-overrides/:organizationMembershipId/branches/:branchId/permissions/:permissionCode',
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a Permission Override',
    description:
      'Removes a Branch-specific Permission Override. Removing a non-existent Override is an idempotent success.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiParam({
    name: 'organizationMembershipId',
    description: 'The target Organization membership identifier.',
  })
  @ApiParam({
    name: 'branchId',
    description: 'The target Branch identifier.',
  })
  @ApiParam({
    name: 'permissionCode',
    description: 'The Permission code whose override should be removed.',
  })
  @ApiOkResponse({
    description: 'Permission Override removal processed successfully.',
    type: RemovePermissionOverrideResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request parameters are invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to remove this Permission Override.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Permission Override removal violates a business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async removePermissionOverride(
    @Param('organizationId') organizationId: string,
    @Param('organizationMembershipId')
    organizationMembershipId: string,
    @Param('branchId') branchId: string,
    @Param('permissionCode') permissionCode: string,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<RemovePermissionOverrideResponseDto> {
    const result = await this.commandBus.execute(
      new RemovePermissionOverrideCommand(principal.userId, {
        organizationId,
        organizationMembershipId,
        branchId,
        permissionCode,
      }),
    );

    return RemovePermissionOverrideResponseDto.from(result);
  }
}
