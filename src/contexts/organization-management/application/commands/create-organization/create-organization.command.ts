import { Command } from '@nestjs/cqrs';
import type { CreateOrganizationInput } from '../../../domain/entities/organization.js';

export interface CreateOrganizationResult {
  readonly organizationId: string;
}

export type CreateOrganizationCommandInput = Omit<
  CreateOrganizationInput,
  'id' | 'status'
>;

export class CreateOrganizationCommand extends Command<CreateOrganizationResult> {
  constructor(
    public readonly actorUserId: string,
    public readonly input: CreateOrganizationCommandInput,
  ) {
    super();
  }
}
