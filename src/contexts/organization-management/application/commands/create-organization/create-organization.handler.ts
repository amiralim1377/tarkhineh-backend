import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  CreateOrganizationCommand,
  type CreateOrganizationResult,
} from './create-organization.command.js';

@CommandHandler(CreateOrganizationCommand)
export class CreateOrganizationHandler implements ICommandHandler<
  CreateOrganizationCommand,
  CreateOrganizationResult
> {
  constructor() {}

  async execute(
    command: CreateOrganizationCommand,
  ): Promise<CreateOrganizationResult> {
    // TODO: Implement organization creation use case.
    throw new Error('Not implemented');
  }
}
