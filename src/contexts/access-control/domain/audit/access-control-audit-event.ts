import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

import {
  ACCESS_CONTROL_AUDIT_EVENT_TYPE,
  type AccessControlAuditEventType,
  type AuditEventState,
} from './access-control-audit-event.types.js';

import { AuditSubjectReference } from './value-objects/audit-subject-reference.vo.js';
import { AuditResourceReference } from './value-objects/audit-resource-reference.vo.js';

import {
  InvalidAccessControlAuditEventError,
  ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE,
  type AccessControlAuditEventErrorCode,
} from '../errors/invalid-access-control-audit-event.error.js';

export interface CreateAccessControlAuditEventProps {
  readonly id?: string;
  readonly eventType: AccessControlAuditEventType;
  readonly organizationId: string;
  readonly branchId?: string | null;
  readonly actorUserId: string;
  readonly subjectReference?: AuditSubjectReference | null;
  readonly resourceReference: AuditResourceReference;
  readonly correlationId?: string | null;
  readonly beforeState?: AuditEventState | null;
  readonly afterState?: AuditEventState | null;
}

export class AccessControlAuditEvent extends Entity<UniqueId> {
  private constructor(
    id: UniqueId,
    private readonly eventType: AccessControlAuditEventType,
    private readonly organizationId: string,
    private readonly branchId: string | null,
    private readonly actorUserId: string,
    private readonly subjectReference: AuditSubjectReference | null,
    private readonly resourceReference: AuditResourceReference,
    private readonly correlationId: string | null,
    private readonly beforeState: AuditEventState | null,
    private readonly afterState: AuditEventState | null,
  ) {
    super(id);
    Object.freeze(this);
  }

  private static normalizeRequiredId(
    value: string,
    errorCode: AccessControlAuditEventErrorCode,
    message: string,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidAccessControlAuditEventError(errorCode, message);
    }

    return value.trim();
  }

  private static normalizeOptionalId(
    value: string | null | undefined,
    errorCode: AccessControlAuditEventErrorCode,
    message: string,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidAccessControlAuditEventError(errorCode, message);
    }

    return value.trim();
  }

  private static freezeState(
    state: AuditEventState | null | undefined,
  ): AuditEventState | null {
    if (state == null) {
      return null;
    }

    const copy: Record<
      string,
      string | number | boolean | null | readonly string[]
    > = {};

    for (const [key, value] of Object.entries(state)) {
      copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
    }

    return Object.freeze(copy);
  }

  static create(
    props: CreateAccessControlAuditEventProps,
  ): AccessControlAuditEvent {
    const error = ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE;

    if (
      !Object.values(ACCESS_CONTROL_AUDIT_EVENT_TYPE).some(
        (value) => value === props.eventType,
      )
    ) {
      throw new InvalidAccessControlAuditEventError(
        error.EVENT_TYPE_INVALID,
        'Audit event type is invalid.',
      );
    }

    if (!(props.resourceReference instanceof AuditResourceReference)) {
      throw new InvalidAccessControlAuditEventError(
        error.RESOURCE_TYPE_INVALID,
        'Audit resource reference is invalid.',
      );
    }

    if (
      props.subjectReference !== undefined &&
      props.subjectReference !== null &&
      !(props.subjectReference instanceof AuditSubjectReference)
    ) {
      throw new InvalidAccessControlAuditEventError(
        error.SUBJECT_TYPE_INVALID,
        'Audit subject reference is invalid.',
      );
    }

    const organizationId = this.normalizeRequiredId(
      props.organizationId,
      error.ORGANIZATION_ID_REQUIRED,
      'Organization ID is required.',
    );

    const actorUserId = this.normalizeRequiredId(
      props.actorUserId,
      error.ACTOR_USER_ID_REQUIRED,
      'Actor User ID is required.',
    );

    const id =
      props.id === undefined
        ? undefined
        : this.normalizeRequiredId(
            props.id,
            error.ID_INVALID,
            'Audit event ID cannot be empty.',
          );

    const branchId = this.normalizeOptionalId(
      props.branchId,
      error.BRANCH_ID_INVALID,
      'Branch ID cannot be empty.',
    );

    const correlationId = this.normalizeOptionalId(
      props.correlationId,
      error.CORRELATION_ID_INVALID,
      'Correlation ID cannot be empty.',
    );

    if (correlationId !== null && correlationId.length > 128) {
      throw new InvalidAccessControlAuditEventError(
        error.CORRELATION_ID_INVALID,
        'Correlation ID cannot exceed 128 characters.',
      );
    }

    const isAuthorizationDenied =
      props.eventType === ACCESS_CONTROL_AUDIT_EVENT_TYPE.AUTHORIZATION_DENIED;

    if (!props.resourceReference.hasId() && !isAuthorizationDenied) {
      throw new InvalidAccessControlAuditEventError(
        error.RESOURCE_ID_REQUIRED,
        'Resource ID is required for this audit event.',
      );
    }

    return new AccessControlAuditEvent(
      new UniqueId(id),
      props.eventType,
      organizationId,
      branchId,
      actorUserId,
      props.subjectReference ?? null,
      props.resourceReference,
      correlationId,
      this.freezeState(props.beforeState),
      this.freezeState(props.afterState),
    );
  }

  getEventType(): AccessControlAuditEventType {
    return this.eventType;
  }

  getOrganizationId(): string {
    return this.organizationId;
  }

  getBranchId(): string | null {
    return this.branchId;
  }

  getActorUserId(): string {
    return this.actorUserId;
  }

  getSubjectReference(): AuditSubjectReference | null {
    return this.subjectReference;
  }

  getResourceReference(): AuditResourceReference {
    return this.resourceReference;
  }

  getCorrelationId(): string | null {
    return this.correlationId;
  }

  getBeforeState(): AuditEventState | null {
    return this.beforeState;
  }

  getAfterState(): AuditEventState | null {
    return this.afterState;
  }
}
