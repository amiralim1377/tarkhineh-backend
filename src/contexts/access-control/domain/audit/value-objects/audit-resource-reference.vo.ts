import {
  ACCESS_CONTROL_AUDIT_RESOURCE_TYPE,
  type AccessControlAuditResourceType,
} from '../access-control-audit-event.types.js';

import {
  ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE,
  InvalidAccessControlAuditEventError,
} from '../../errors/invalid-access-control-audit-event.error.js';

export interface CreateAuditResourceReferenceProps {
  readonly type: AccessControlAuditResourceType;
  readonly id?: string | null;
}

export class AuditResourceReference {
  private constructor(
    private readonly type: AccessControlAuditResourceType,
    private readonly id: string | null,
  ) {
    Object.freeze(this);
  }

  static create(
    props: CreateAuditResourceReferenceProps,
  ): AuditResourceReference {
    const error = ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE;

    if (
      !Object.values(ACCESS_CONTROL_AUDIT_RESOURCE_TYPE).some(
        (value) => value === props.type,
      )
    ) {
      throw new InvalidAccessControlAuditEventError(
        error.RESOURCE_TYPE_INVALID,
        'Audit resource type is invalid.',
      );
    }

    let resourceId: string | null;

    if (props.id === undefined || props.id === null) {
      resourceId = null;
    } else if (typeof props.id !== 'string' || props.id.trim().length === 0) {
      throw new InvalidAccessControlAuditEventError(
        error.RESOURCE_ID_INVALID,
        'Audit resource ID cannot be empty.',
      );
    } else {
      resourceId = props.id.trim();
    }

    // An unresolved resource is represented by AUTHORIZATION.
    if (
      resourceId === null &&
      props.type !== ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION
    ) {
      throw new InvalidAccessControlAuditEventError(
        error.RESOURCE_ID_REQUIRED,
        'A resource ID is required for this resource type.',
      );
    }

    return new AuditResourceReference(props.type, resourceId);
  }

  getType(): AccessControlAuditResourceType {
    return this.type;
  }

  getId(): string | null {
    return this.id;
  }

  hasId(): boolean {
    return this.id !== null;
  }

  equals(other: AuditResourceReference | null | undefined): boolean {
    if (other == null) {
      return false;
    }

    return this.type === other.type && this.id === other.id;
  }
}
