import {
  ACCESS_CONTROL_AUDIT_SUBJECT_TYPE,
  type AccessControlAuditSubjectType,
} from '../access-control-audit-event.types.js';

import {
  ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE,
  InvalidAccessControlAuditEventError,
} from '../../errors/invalid-access-control-audit-event.error.js';

export interface CreateAuditSubjectReferenceProps {
  readonly type: AccessControlAuditSubjectType;
  readonly id: string;
}

export class AuditSubjectReference {
  private constructor(
    private readonly type: AccessControlAuditSubjectType,
    private readonly id: string,
  ) {
    Object.freeze(this);
  }

  static create(
    props: CreateAuditSubjectReferenceProps,
  ): AuditSubjectReference {
    if (
      !Object.values(ACCESS_CONTROL_AUDIT_SUBJECT_TYPE).some(
        (value) => value === props.type,
      )
    ) {
      throw new InvalidAccessControlAuditEventError(
        ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.SUBJECT_TYPE_INVALID,
        'Audit subject type is invalid.',
      );
    }

    if (typeof props.id !== 'string' || props.id.trim().length === 0) {
      throw new InvalidAccessControlAuditEventError(
        ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.SUBJECT_ID_INVALID,
        'Audit subject ID cannot be empty.',
      );
    }

    return new AuditSubjectReference(props.type, props.id.trim());
  }

  getType(): AccessControlAuditSubjectType {
    return this.type;
  }

  getId(): string {
    return this.id;
  }

  equals(other: AuditSubjectReference | null | undefined): boolean {
    if (other == null) {
      return false;
    }

    return this.type === other.type && this.id === other.id;
  }
}
