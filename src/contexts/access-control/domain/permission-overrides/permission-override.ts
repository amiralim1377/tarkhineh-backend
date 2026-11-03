import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  PERMISSION_CATALOG,
  PERMISSION_RESOURCE_LEVEL,
  type PermissionCode,
} from '../permissions/permission-catalog.js';
import {
  InvalidPermissionOverrideError,
  PERMISSION_OVERRIDE_ERROR_CODE,
} from '../errors/invalid-permission-override.error.js';

export const PERMISSION_OVERRIDE_EFFECT = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
} as const;

export type PermissionOverrideEffect =
  (typeof PERMISSION_OVERRIDE_EFFECT)[keyof typeof PERMISSION_OVERRIDE_EFFECT];

export interface PermissionOverrideMembershipReference {
  readonly id: string;
  readonly organizationId: string;
}

export interface PermissionOverrideBranchReference {
  readonly id: string;
  readonly organizationId: string;
}

export interface CreatePermissionOverrideInput {
  readonly id?: string;
  readonly organizationId: string;
  readonly organizationMembership: PermissionOverrideMembershipReference;
  readonly branch: PermissionOverrideBranchReference;
  readonly permissionCode: string;
  readonly assignedById: string;
  readonly effect: PermissionOverrideEffect;
  readonly createdAt: Date;
}

export interface PermissionOverrideProps {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationMembership: PermissionOverrideMembershipReference;
  readonly branch: PermissionOverrideBranchReference;
  readonly permissionCode: string;
  readonly assignedById: string;
  readonly effect: PermissionOverrideEffect;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class PermissionOverride extends Entity<UniqueId> {
  private constructor(
    id: UniqueId,
    private readonly organizationIdValue: string,
    private readonly organizationMembershipIdValue: string,
    private readonly branchIdValue: string,
    private readonly permissionCodeValue: PermissionCode,
    private readonly assignedByIdValue: string,
    private effectValue: PermissionOverrideEffect,
    private readonly createdAtValue: Date,
    private updatedAtValue: Date,
  ) {
    super(id);
    this.createdAtValue = new Date(createdAtValue.getTime());
    this.updatedAtValue = new Date(updatedAtValue.getTime());
  }

  static create(input: CreatePermissionOverrideInput): PermissionOverride {
    const normalized = PermissionOverride.validateCommon(input);

    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.ID_REQUIRED,
        'Permission override ID cannot be empty.',
      );
    }

    return new PermissionOverride(
      new UniqueId(id),
      normalized.organizationId,
      normalized.organizationMembershipId,
      normalized.branchId,
      normalized.permissionCode,
      normalized.assignedById,
      input.effect,
      input.createdAt,
      input.createdAt,
    );
  }

  static reconstitute(props: PermissionOverrideProps): PermissionOverride {
    const normalized = PermissionOverride.validateCommon(props);

    if (!props.id.trim()) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.ID_REQUIRED,
        'Persisted permission override ID is required.',
      );
    }

    PermissionOverride.validateDate(
      props.updatedAt,
      PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
      'Permission override update date must be valid.',
    );

    if (props.updatedAt < props.createdAt) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
        'Permission override cannot be updated before creation.',
      );
    }

    return new PermissionOverride(
      new UniqueId(props.id.trim()),
      normalized.organizationId,
      normalized.organizationMembershipId,
      normalized.branchId,
      normalized.permissionCode,
      normalized.assignedById,
      props.effect,
      props.createdAt,
      props.updatedAt,
    );
  }

  private static validateCommon(input: {
    readonly organizationId: string;
    readonly organizationMembership: PermissionOverrideMembershipReference;
    readonly branch: PermissionOverrideBranchReference;
    readonly permissionCode: string;
    readonly assignedById: string;
    readonly effect: PermissionOverrideEffect;
    readonly createdAt: Date;
  }): {
    readonly organizationId: string;
    readonly organizationMembershipId: string;
    readonly branchId: string;
    readonly permissionCode: PermissionCode;
    readonly assignedById: string;
  } {
    const organizationId = input.organizationId.trim();
    const organizationMembershipId = input.organizationMembership.id.trim();
    const membershipOrganizationId =
      input.organizationMembership.organizationId.trim();
    const branchId = input.branch.id.trim();
    const branchOrganizationId = input.branch.organizationId.trim();
    const assignedById = input.assignedById.trim();

    if (!organizationId) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Permission override Organization ID is required.',
      );
    }

    if (!organizationMembershipId) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_MEMBERSHIP_ID_REQUIRED,
        'Permission override OrganizationMembership ID is required.',
      );
    }

    if (!branchId) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.BRANCH_ID_REQUIRED,
        'Permission override Branch ID is required.',
      );
    }

    if (!assignedById) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.ASSIGNED_BY_ID_REQUIRED,
        'Permission override actor ID is required.',
      );
    }

    if (
      membershipOrganizationId !== organizationId ||
      branchOrganizationId !== organizationId
    ) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.ORGANIZATION_MISMATCH,
        'Permission override membership and branch must belong to the same Organization.',
      );
    }

    if (!Object.hasOwn(PERMISSION_CATALOG, input.permissionCode)) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.PERMISSION_UNKNOWN,
        `Unknown Permission code: "${input.permissionCode}".`,
      );
    }

    const permissionCode = input.permissionCode as PermissionCode;

    if (
      PERMISSION_CATALOG[permissionCode].resourceLevel !==
      PERMISSION_RESOURCE_LEVEL.BRANCH
    ) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.PERMISSION_SCOPE_INVALID,
        'Permission overrides are supported only for Branch-target permissions.',
      );
    }

    if (
      input.effect !== PERMISSION_OVERRIDE_EFFECT.ALLOW &&
      input.effect !== PERMISSION_OVERRIDE_EFFECT.DENY
    ) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.EFFECT_INVALID,
        'Permission override effect must be ALLOW or DENY.',
      );
    }

    PermissionOverride.validateDate(
      input.createdAt,
      PERMISSION_OVERRIDE_ERROR_CODE.CREATED_AT_INVALID,
      'Permission override creation date must be valid.',
    );

    return {
      organizationId,
      organizationMembershipId,
      branchId,
      permissionCode,
      assignedById,
    };
  }

  private static validateDate(
    value: Date,
    code:
      | typeof PERMISSION_OVERRIDE_ERROR_CODE.CREATED_AT_INVALID
      | typeof PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
    message: string,
  ): void {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new InvalidPermissionOverrideError(code, message);
    }
  }

  get id(): string {
    return this.getId().getValue();
  }

  get organizationId(): string {
    return this.organizationIdValue;
  }

  get organizationMembershipId(): string {
    return this.organizationMembershipIdValue;
  }

  get branchId(): string {
    return this.branchIdValue;
  }

  get permissionCode(): PermissionCode {
    return this.permissionCodeValue;
  }

  get assignedById(): string {
    return this.assignedByIdValue;
  }

  get effect(): PermissionOverrideEffect {
    return this.effectValue;
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  /**
   * The database uniqueness key is:
   * organizationMembershipId + branchId + permissionCode.
   */
  get uniquenessKey(): string {
    return [
      this.organizationMembershipIdValue,
      this.branchIdValue,
      this.permissionCodeValue,
    ].join(':');
  }

  /**
   * Changes the effect on the same logical override.
   * Persistence must update the unique row rather than insert another one.
   */
  changeEffect(effect: PermissionOverrideEffect, updatedAt: Date): boolean {
    if (
      effect !== PERMISSION_OVERRIDE_EFFECT.ALLOW &&
      effect !== PERMISSION_OVERRIDE_EFFECT.DENY
    ) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.EFFECT_INVALID,
        'Permission override effect must be ALLOW or DENY.',
      );
    }

    PermissionOverride.validateDate(
      updatedAt,
      PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
      'Permission override update date must be valid.',
    );

    if (updatedAt < this.updatedAtValue || updatedAt < this.createdAtValue) {
      throw new InvalidPermissionOverrideError(
        PERMISSION_OVERRIDE_ERROR_CODE.UPDATED_AT_INVALID,
        'Permission override update date cannot precede its current state.',
      );
    }

    if (effect === this.effectValue) {
      return false;
    }

    this.effectValue = effect;
    this.updatedAtValue = new Date(updatedAt.getTime());

    return true;
  }
}
