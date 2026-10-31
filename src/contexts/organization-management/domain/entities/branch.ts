import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

import { BranchSlug } from '../value-objects/branch-slug.vo.js';

// ============================================================
// BRANCH TYPES
// ============================================================

export type BranchStatus = 'ACTIVE' | 'INACTIVE';

// Input required to create a new branch.
export interface CreateBranchInput {
  readonly id?: string;
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
}

// Data used to reconstruct an existing branch.
export interface BranchProps {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly status: BranchStatus;
}

// Internal state of the Branch entity.
interface BranchState {
  readonly id: string;
  readonly organizationId: string;
  name: string;
  readonly slug: BranchSlug;
  status: BranchStatus;
}

// BRANCH ENTITY
export class Branch extends Entity<UniqueId> {
  private constructor(private readonly props: BranchState) {
    super(new UniqueId(props.id));
  }

  // CREATE

  static create(input: CreateBranchInput): Branch {
    // Validate branch name.
    const branchName = input.name.trim();

    if (branchName.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.NAME_REQUIRED,
        'Branch name is required.',
      );
    }

    // Validate organization ID.
    const organizationId = input.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Branch organization ID is required.',
      );
    }

    // Validate explicitly provided ID.
    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ID_REQUIRED,
        'Branch ID is required.',
      );
    }

    const branchId = new UniqueId(id);

    // Create and validate branch slug.
    const branchSlug = BranchSlug.create(input.slug);

    // Build the initial branch state.
    const state: BranchState = {
      id: branchId.getValue(),
      organizationId,
      name: branchName,
      slug: branchSlug,
      status: 'ACTIVE',
    };

    return new Branch(state);
  }

  // RECONSTITUTE
  static reconstitute(props: BranchProps): Branch {
    // Validate branch ID.
    const id = props.id.trim();

    if (id.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ID_REQUIRED,
        'Branch ID is required.',
      );
    }

    // Validate organization ID.
    const organizationId = props.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Branch organization ID is required.',
      );
    }

    // Validate branch name.
    const branchName = props.name.trim();

    if (branchName.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.NAME_REQUIRED,
        'Branch name is required.',
      );
    }

    // Validate branch status.
    if (props.status !== 'ACTIVE' && props.status !== 'INACTIVE') {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.STATUS_INVALID,
        'Branch status is invalid.',
      );
    }

    // Reconstruct branch slug.
    const branchSlug = BranchSlug.create(props.slug);

    // Persisted slug must already be in its canonical form.
    if (branchSlug.getValue() !== props.slug) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.SLUG_INVALID,
        'Persisted branch slug is not in canonical format.',
      );
    }

    // Restore the original branch state.
    const state: BranchState = {
      id,
      organizationId,
      name: branchName,
      slug: branchSlug,
      status: props.status,
    };

    return new Branch(state);
  }

  // GETTERS
  get id(): string {
    return this.getId().getValue();
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug.getValue();
  }

  get status(): BranchStatus {
    return this.props.status;
  }

  // DOMAIN BEHAVIORS

  rename(name: string): void {
    const normalizedName = name.trim();

    if (normalizedName.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.NAME_REQUIRED,
        'Branch name is required.',
      );
    }

    this.props.name = normalizedName;
  }

  activate(): boolean {
    if (this.props.status === 'ACTIVE') {
      return false;
    }

    this.props.status = 'ACTIVE';

    return true;
  }

  deactivate(): boolean {
    if (this.props.status === 'INACTIVE') {
      return false;
    }

    this.props.status = 'INACTIVE';

    return true;
  }

  isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }
}
