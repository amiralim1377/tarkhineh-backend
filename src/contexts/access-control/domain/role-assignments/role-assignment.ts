import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  InvalidRoleAssignmentError,
  ROLE_ASSIGNMENT_ERROR_CODE,
} from '../errors/invalid-role-assignment.error.js';
import {
  ROLE_ASSIGNMENT_TARGET,
  ROLE_DEFINITION_SOURCE,
} from '../roles/role.types.js';
import { Role } from '../roles/role.js';
import { SYSTEM_ROLE_CODE } from '../roles/system-role-catalog.js';

export interface RoleAssignmentMembershipReference {
  readonly id: string;
  readonly organizationId: string;
}

export interface CreateRoleAssignmentInput {
  readonly id?: string;
  readonly role: Role;
  readonly organizationMembership?: RoleAssignmentMembershipReference | null;
  readonly branchMembership?: RoleAssignmentMembershipReference | null;
  readonly assignedById?: string | null;
  readonly createdAt: Date;
}

export interface RoleAssignmentProps {
  readonly id: string;
  readonly role: Role;
  readonly organizationMembership?: RoleAssignmentMembershipReference | null;
  readonly branchMembership?: RoleAssignmentMembershipReference | null;
  readonly assignedById: string | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

interface ValidatedTarget {
  readonly organizationMembershipId: string | null;
  readonly branchMembershipId: string | null;
  readonly organizationId: string;
}

export class RoleAssignment extends Entity<UniqueId> {
  private readonly roleIdValue: string;
  private readonly organizationMembershipIdValue: string | null;
  private readonly branchMembershipIdValue: string | null;
  private readonly organizationIdValue: string;
  private readonly assignedByIdValue: string | null;
  private readonly createdAtValue: Date;
  private revokedAtValue: Date | null;

  private constructor(
    id: UniqueId,
    roleId: string,
    organizationMembershipId: string | null,
    branchMembershipId: string | null,
    organizationId: string,
    assignedById: string | null,
    createdAt: Date,
    revokedAt: Date | null,
  ) {
    super(id);

    this.roleIdValue = roleId;
    this.organizationMembershipIdValue = organizationMembershipId;
    this.branchMembershipIdValue = branchMembershipId;
    this.organizationIdValue = organizationId;
    this.assignedByIdValue = assignedById;
    this.createdAtValue = new Date(createdAt.getTime());
    this.revokedAtValue =
      revokedAt === null ? null : new Date(revokedAt.getTime());
  }

  /**
   * Creates an assignment through an ordinary role-assignment workflow.
   * Reserved, archived, and non-assignable Roles are rejected.
   */
  static create(input: CreateRoleAssignmentInput): RoleAssignment {
    if (
      !(input.role instanceof Role) ||
      !input.role.canBeAssignedThroughGenericWorkflow()
    ) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ROLE_NOT_ASSIGNABLE,
        'Role cannot be assigned through a generic assignment workflow.',
      );
    }

    return RoleAssignment.createValidated(input);
  }

  /**
   * Dedicated entry point for the organization-owner lifecycle workflow.
   * Application authorization and owner/membership consistency must still
   * be checked by the owning use case.
   */
  static createForOrganizationOwner(
    input: CreateRoleAssignmentInput,
  ): RoleAssignment {
    if (
      !(input.role instanceof Role) ||
      input.role.getCode() !== SYSTEM_ROLE_CODE.ORGANIZATION_OWNER ||
      !input.role.isEffectiveForAuthorization()
    ) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.OWNER_ROLE_FACTORY_REQUIRED,
        'The owner assignment workflow requires an active ORGANIZATION_OWNER role.',
      );
    }

    if (
      input.organizationMembership == null ||
      input.branchMembership != null
    ) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNMENT_SCOPE_MISMATCH,
        'An organization owner must be assigned to an OrganizationMembership.',
      );
    }

    return RoleAssignment.createValidated(input);
  }

  /**
   * Restores a persisted assignment, including historical assignments
   * whose Role may now be archived or non-assignable.
   */
  static reconstitute(props: RoleAssignmentProps): RoleAssignment {
    if (!props.id.trim()) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ID_REQUIRED,
        'Persisted role assignment ID is required.',
      );
    }

    const target = RoleAssignment.validateTarget(
      props.role,
      props.organizationMembership,
      props.branchMembership,
    );

    RoleAssignment.validateAssignedById(props.assignedById);
    RoleAssignment.validateDate(
      props.createdAt,
      ROLE_ASSIGNMENT_ERROR_CODE.CREATED_AT_INVALID,
      'Role assignment creation date must be valid.',
    );

    if (props.revokedAt !== null) {
      RoleAssignment.validateDate(
        props.revokedAt,
        ROLE_ASSIGNMENT_ERROR_CODE.REVOKED_AT_INVALID,
        'Role assignment revocation date must be valid.',
      );

      if (props.revokedAt < props.createdAt) {
        throw new InvalidRoleAssignmentError(
          ROLE_ASSIGNMENT_ERROR_CODE.REVOCATION_BEFORE_CREATION,
          'Role assignment cannot be revoked before it was created.',
        );
      }
    }

    return new RoleAssignment(
      new UniqueId(props.id.trim()),
      props.role.getId().getValue(),
      target.organizationMembershipId,
      target.branchMembershipId,
      target.organizationId,
      props.assignedById?.trim() || null,
      props.createdAt,
      props.revokedAt,
    );
  }

  private static createValidated(
    input: CreateRoleAssignmentInput,
  ): RoleAssignment {
    const target = RoleAssignment.validateTarget(
      input.role,
      input.organizationMembership,
      input.branchMembership,
    );

    RoleAssignment.validateAssignedById(input.assignedById);
    RoleAssignment.validateDate(
      input.createdAt,
      ROLE_ASSIGNMENT_ERROR_CODE.CREATED_AT_INVALID,
      'Role assignment creation date must be valid.',
    );

    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ID_REQUIRED,
        'Role assignment ID cannot be empty.',
      );
    }

    return new RoleAssignment(
      new UniqueId(id),
      input.role.getId().getValue(),
      target.organizationMembershipId,
      target.branchMembershipId,
      target.organizationId,
      input.assignedById?.trim() || null,
      input.createdAt,
      null,
    );
  }

  private static validateTarget(
    role: Role,
    organizationMembership?: RoleAssignmentMembershipReference | null,
    branchMembership?: RoleAssignmentMembershipReference | null,
  ): ValidatedTarget {
    if (!(role instanceof Role)) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ROLE_REQUIRED,
        'Role assignment requires a valid Role.',
      );
    }

    const hasOrganizationMembership = organizationMembership != null;
    const hasBranchMembership = branchMembership != null;

    if (hasOrganizationMembership === hasBranchMembership) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.MEMBERSHIP_TARGET_INVALID,
        'Role assignment must target exactly one membership.',
      );
    }

    const target = hasOrganizationMembership
      ? organizationMembership
      : branchMembership;

    if (!target) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.MEMBERSHIP_TARGET_INVALID,
        'Role assignment membership target is missing.',
      );
    }

    const targetId = target.id.trim();
    const targetOrganizationId = target.organizationId.trim();

    if (!targetId) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.TARGET_ID_REQUIRED,
        'Role assignment membership ID is required.',
      );
    }

    if (!targetOrganizationId) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Role assignment target Organization ID is required.',
      );
    }

    const expectedAssignmentTarget = hasOrganizationMembership
      ? ROLE_ASSIGNMENT_TARGET.ORGANIZATION
      : ROLE_ASSIGNMENT_TARGET.BRANCH;

    if (role.getAssignmentTarget() !== expectedAssignmentTarget) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNMENT_SCOPE_MISMATCH,
        'Role assignment target does not match the membership target.',
      );
    }

    if (
      role.getDefinitionSource() ===
        ROLE_DEFINITION_SOURCE.ORGANIZATION_DEFINED &&
      role.getOrganizationId() !== targetOrganizationId
    ) {
      throw new InvalidRoleAssignmentError(
        ROLE_ASSIGNMENT_ERROR_CODE.ORGANIZATION_MISMATCH,
        'An Organization-defined Role cannot be assigned outside its Organization.',
      );
    }

    return {
      organizationMembershipId: hasOrganizationMembership ? targetId : null,
      branchMembershipId: hasBranchMembership ? targetId : null,
      organizationId: targetOrganizationId,
    };
  }

  private static validateAssignedById(assignedById?: string | null): void {
    if (assignedById !== undefined && assignedById !== null) {
      if (!assignedById.trim()) {
        throw new InvalidRoleAssignmentError(
          ROLE_ASSIGNMENT_ERROR_CODE.ASSIGNED_BY_ID_INVALID,
          'Role assignment actor ID cannot be empty.',
        );
      }
    }
  }

  private static validateDate(
    value: Date,
    code:
      | typeof ROLE_ASSIGNMENT_ERROR_CODE.CREATED_AT_INVALID
      | typeof ROLE_ASSIGNMENT_ERROR_CODE.REVOKED_AT_INVALID,
    message: string,
  ): void {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new InvalidRoleAssignmentError(code, message);
    }
  }

  get id(): string {
    return this.getId().getValue();
  }

  get roleId(): string {
    return this.roleIdValue;
  }

  get organizationMembershipId(): string | null {
    return this.organizationMembershipIdValue;
  }

  get branchMembershipId(): string | null {
    return this.branchMembershipIdValue;
  }

  get organizationId(): string {
    return this.organizationIdValue;
  }

  get assignedById(): string | null {
    return this.assignedByIdValue;
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  get revokedAt(): Date | null {
    return this.revokedAtValue === null
      ? null
      : new Date(this.revokedAtValue.getTime());
  }

  isRevoked(): boolean {
    return this.revokedAtValue !== null;
  }

  isEffectiveForAuthorization(role: Role): boolean {
    return (
      role instanceof Role &&
      role.getId().getValue() === this.roleIdValue &&
      !this.isRevoked() &&
      role.isEffectiveForAuthorization()
    );
  }

  revoke(at: Date): boolean {
    if (
      !(at instanceof Date) ||
      !Number.isFinite(at.getTime()) ||
      at < this.createdAtValue ||
      this.revokedAtValue !== null
    ) {
      return false;
    }

    this.revokedAtValue = new Date(at.getTime());
    return true;
  }
}
