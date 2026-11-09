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
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../identity-access/presentation/http/auth/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../../../../identity-access/presentation/http/auth/contracts/authentication-strategy.js';
import { Auth } from '../../../../identity-access/presentation/http/auth/decorators/auth.decorator.js';
import { AuthType } from '../../../../identity-access/presentation/http/auth/contracts/auth-type.enum.js';
import { CreateBranchCommand } from '../../../application/commands/create-branch/create-branch.command.js';
import { CreateBranchDto } from '../dto/create-branch.dto.js';
import { CreateBranchResponseDto } from '../dto/create-branch-response.dto.js';
import {
  ApiProblemBadRequestResponse,
  ApiProblemResponse,
  ApiProblemServiceUnavailableResponse,
  ApiProblemUnauthorizedResponse,
} from '../../../../../shared/presentation/http/api-problem-response.decorator.js';

@ApiTags('Organization Management')
@Controller('organizations/:organizationId/branches')
export class OrganizationBranchesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Auth(AuthType.Bearer, AuthType.Cookie)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a Branch',
    description:
      'Creates a new Branch within the specified Organization after validating the actor authorization.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'The Organization identifier.',
  })
  @ApiBody({
    type: CreateBranchDto,
  })
  @ApiCreatedResponse({
    description: 'Branch created successfully.',
    type: CreateBranchResponseDto,
  })
  @ApiProblemBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiProblemUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiProblemResponse(HttpStatus.FORBIDDEN, {
    description:
      'The authenticated actor is not authorized to create a Branch.',
  })
  @ApiProblemResponse(HttpStatus.NOT_FOUND, {
    description: 'The specified Organization was not found.',
  })
  @ApiProblemResponse(HttpStatus.CONFLICT, {
    description:
      'The Organization is suspended or a Branch with the supplied slug already exists.',
  })
  @ApiProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, {
    description: 'The Branch data violates a domain business rule.',
  })
  @ApiProblemServiceUnavailableResponse({
    description: 'A required dependency is unavailable.',
  })
  async createBranch(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateBranchDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<CreateBranchResponseDto> {
    const result = await this.commandBus.execute(
      new CreateBranchCommand(principal.userId, {
        organizationId,
        ...body,
      }),
    );

    return CreateBranchResponseDto.from(result);
  }
}
