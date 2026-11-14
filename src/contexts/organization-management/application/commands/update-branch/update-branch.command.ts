import { Command } from '@nestjs/cqrs';
import type { CreateBranchInput } from '../../../domain/entities/branch.js';

export type UpdateBranchCommandInput = Partial<
  Pick<
    CreateBranchInput,
    | 'nameFa'
    | 'nameEn'
    | 'phoneNumber'
    | 'addressFa'
    | 'addressEn'
    | 'cityFa'
    | 'cityEn'
    | 'postalCode'
    | 'countryCode'
    | 'latitude'
    | 'longitude'
    | 'timeZoneId'
  >
>;

export interface UpdateBranchResult {
  readonly branchId: string;
}

export class UpdateBranchCommand extends Command<UpdateBranchResult> {
  constructor(
    public readonly actorUserId: string,
    public readonly organizationId: string,
    public readonly branchId: string,
    public readonly input: UpdateBranchCommandInput,
  ) {
    super();
  }
}
