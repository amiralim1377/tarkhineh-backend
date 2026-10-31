import type { Branch } from '../../domain/entities/branch.js';

export const BRANCH_REPOSITORY = Symbol('BRANCH_REPOSITORY');

export interface BranchRepository {
  existsBySlug(organizationId: string, slug: string): Promise<boolean>;

  save(branch: Branch): Promise<void>;
}
