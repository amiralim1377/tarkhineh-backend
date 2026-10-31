import { Command } from '@nestjs/cqrs';
import type { CreateBranchInput } from '../../../domain/entities/branch.js';

export interface CreateBranchResult {
  readonly branchId: string;
}

export type CreateBranchCommandInput = Omit<CreateBranchInput, 'id' | 'status'>;

export class CreateBranchCommand extends Command<CreateBranchResult> {
  constructor(
    public readonly actorUserId: string,
    public readonly input: CreateBranchCommandInput,
  ) {
    super();
  }
}
