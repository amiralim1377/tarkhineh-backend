import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Branch } from '../../../domain/entities/branch.js';
import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from '../../ports/branch.repository.js';
import {
  ORGANIZATION_LOOKUP_PORT,
  type OrganizationLookupPort,
} from '../../ports/organization-lookup.port.js';
import {
  BRANCH_CREATION_AUTHORIZATION_PORT,
  type BranchCreationAuthorizationPort,
} from '../../ports/branch-creation-authorization.port.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { BranchSlugAlreadyExistsError } from '../../errors/branch-slug-already-exists.error.js';
import { BranchCreationForbiddenError } from '../../errors/branch-creation-forbidden.error.js';
import {
  CreateBranchCommand,
  type CreateBranchResult,
} from './create-branch.command.js';

@CommandHandler(CreateBranchCommand)
export class CreateBranchHandler implements ICommandHandler<
  CreateBranchCommand,
  CreateBranchResult
> {
  constructor(
    @Inject(BRANCH_REPOSITORY)
    private readonly branchRepository: BranchRepository,
    @Inject(ORGANIZATION_LOOKUP_PORT)
    private readonly organizationLookup: OrganizationLookupPort,
    @Inject(BRANCH_CREATION_AUTHORIZATION_PORT)
    private readonly branchCreationAuthorization: BranchCreationAuthorizationPort,
  ) {}

  async execute(command: CreateBranchCommand): Promise<CreateBranchResult> {
    const actorUserId = command.actorUserId.trim();

    if (!actorUserId) {
      throw new BranchCreationForbiddenError();
    }

    const branch = Branch.create(command.input);

    const organizationExists = await this.organizationLookup.existsById(
      branch.organizationId,
    );

    if (!organizationExists) {
      throw new OrganizationNotFoundError(branch.organizationId);
    }

    const canCreateBranch =
      await this.branchCreationAuthorization.canCreateBranch({
        actorUserId,
        organizationId: branch.organizationId,
      });

    if (!canCreateBranch) {
      throw new BranchCreationForbiddenError();
    }

    const slugExists = await this.branchRepository.existsBySlug(
      branch.organizationId,
      branch.slug,
    );

    if (slugExists) {
      throw new BranchSlugAlreadyExistsError(
        branch.organizationId,
        branch.slug,
      );
    }

    await this.branchRepository.save(branch);

    return {
      branchId: branch.id,
    };
  }
}
