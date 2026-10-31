import { Command } from '@nestjs/cqrs';

import type { CreateBranchInput } from '../../../domain/entities/branch.js';

export interface CreateBranchResult {
  branchId: string;
}

export type CreateBranchCommandInput = Omit<CreateBranchInput, 'id' | 'status'>;

export class CreateBranchCommand extends Command<CreateBranchResult> {
  constructor(public readonly input: CreateBranchCommandInput) {
    super();
  }
}
