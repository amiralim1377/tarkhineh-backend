import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Branch } from '../../../domain/entities/branch.js';
import { ORGANIZATION_STATUS } from '../../../contracts/lifecycle-status.contract.js';
import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from '../../ports/branch.repository.js';
import {
  ORGANIZATION_LOOKUP_PORT,
  type OrganizationLookupPort,
} from '../../ports/organization-lookup.port.js';
import {
  BRANCH_UPDATE_AUTHORIZATION_PORT,
  type BranchUpdateAuthorizationPort,
} from '../../ports/branch-update-authorization.port.js';
import { OrganizationNotFoundError } from '../../errors/organization-not-found.error.js';
import { OrganizationSuspendedError } from '../../errors/organization-suspended.error.js';
import { BranchNotFoundError } from '../../errors/branch-not-found.error.js';
import { BranchUpdateForbiddenError } from '../../errors/branch-update-forbidden.error.js';
import {
  UpdateBranchCommand,
  type UpdateBranchResult,
  type UpdateBranchCommandInput,
} from './update-branch.command.js';

@CommandHandler(UpdateBranchCommand)
export class UpdateBranchHandler implements ICommandHandler<
  UpdateBranchCommand,
  UpdateBranchResult
> {
  constructor(
    @Inject(BRANCH_REPOSITORY)
    private readonly branchRepository: BranchRepository,
    @Inject(ORGANIZATION_LOOKUP_PORT)
    private readonly organizationLookup: OrganizationLookupPort,
    @Inject(BRANCH_UPDATE_AUTHORIZATION_PORT)
    private readonly branchUpdateAuthorization: BranchUpdateAuthorizationPort,
  ) {}

  async execute(command: UpdateBranchCommand): Promise<UpdateBranchResult> {
    const actorUserId = command.actorUserId.trim();
    const organizationId = command.organizationId.trim();
    const branchId = command.branchId.trim();

    if (!actorUserId) {
      throw new BranchUpdateForbiddenError();
    }

    // 1. Check Organization existence and status.
    const organizationStatus =
      await this.organizationLookup.findStatusById(organizationId);

    if (organizationStatus === null) {
      throw new OrganizationNotFoundError(organizationId);
    }

    if (organizationStatus !== ORGANIZATION_STATUS.ACTIVE) {
      throw new OrganizationSuspendedError(organizationId);
    }

    // 2. Find the Branch within the specified Organization.
    const branch = await this.branchRepository.findById(
      organizationId,
      branchId,
    );

    if (branch === null) {
      throw new BranchNotFoundError(organizationId, branchId);
    }

    // 3. Check authorization for the requested Branch.
    const canUpdateBranch =
      await this.branchUpdateAuthorization.canUpdateBranch({
        actorUserId,
        organizationId,
        branchId,
      });

    if (!canUpdateBranch) {
      throw new BranchUpdateForbiddenError();
    }

    // 4. Apply Domain behaviors.
    this.applyUpdates(branch, command.input);

    // 5. Persist the updated Branch.
    await this.branchRepository.update(branch);

    return {
      branchId: branch.id,
    };
  }

  private applyUpdates(branch: Branch, input: UpdateBranchCommandInput): void {
    // Update branch name.
    if (input.nameFa !== undefined || input.nameEn !== undefined) {
      branch.rename(
        input.nameFa ?? branch.nameFa,
        input.nameEn === undefined ? branch.nameEn : input.nameEn,
      );
    }

    // Update branch address.
    const hasAddressUpdate =
      input.addressFa !== undefined ||
      input.addressEn !== undefined ||
      input.cityFa !== undefined ||
      input.cityEn !== undefined ||
      input.postalCode !== undefined ||
      input.countryCode !== undefined;

    if (hasAddressUpdate) {
      branch.updateAddress({
        addressFa: input.addressFa ?? branch.addressFa,
        addressEn:
          input.addressEn === undefined ? branch.addressEn : input.addressEn,
        cityFa: input.cityFa ?? branch.cityFa,
        cityEn: input.cityEn === undefined ? branch.cityEn : input.cityEn,
        postalCode:
          input.postalCode === undefined ? branch.postalCode : input.postalCode,
        countryCode: input.countryCode ?? branch.countryCode,
      });
    }

    // Update branch location.
    if (input.latitude !== undefined || input.longitude !== undefined) {
      const latitude =
        input.latitude === undefined ? branch.latitude : input.latitude;

      const longitude =
        input.longitude === undefined ? branch.longitude : input.longitude;

      branch.updateLocation(latitude, longitude);
    }

    // Update branch phone number.
    if (input.phoneNumber !== undefined) {
      branch.updatePhoneNumber(input.phoneNumber);
    }

    // Update branch time zone.
    if (input.timeZoneId !== undefined) {
      branch.updateTimeZone(input.timeZoneId);
    }
  }
}
