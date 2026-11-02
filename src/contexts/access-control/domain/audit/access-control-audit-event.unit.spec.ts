import { describe, expect, it } from 'vitest';

import {
  ACCESS_CONTROL_AUDIT_EVENT_TYPE,
  ACCESS_CONTROL_AUDIT_RESOURCE_TYPE,
  ACCESS_CONTROL_AUDIT_SUBJECT_TYPE,
  type AccessControlAuditEventType,
} from './access-control-audit-event.types.js';

import {
  InvalidAccessControlAuditEventError,
  ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE,
} from '../errors/invalid-access-control-audit-event.error.js';

import { AuditSubjectReference } from './value-objects/audit-subject-reference.vo.js';
import { AuditResourceReference } from './value-objects/audit-resource-reference.vo.js';

import {
  AccessControlAuditEvent,
  type CreateAccessControlAuditEventProps,
} from './access-control-audit-event.js';

function createAuditEvent(
  overrides: Partial<CreateAccessControlAuditEventProps> = {},
): AccessControlAuditEvent {
  return AccessControlAuditEvent.create({
    id: 'audit-event-1',
    eventType: ACCESS_CONTROL_AUDIT_EVENT_TYPE.ROLE_ASSIGNED,
    organizationId: 'organization-1',
    branchId: 'branch-1',
    actorUserId: 'actor-1',
    subjectReference: AuditSubjectReference.create({
      type: ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.USER,
      id: 'user-1',
    }),
    resourceReference: AuditResourceReference.create({
      type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.ROLE,
      id: 'role-1',
    }),
    correlationId: 'request-1',
    beforeState: null,
    afterState: {
      permissionCodes: ['branch.staff.read'],
    },
    ...overrides,
  });
}

describe('AccessControlAuditEvent', () => {
  describe('creation', () => {
    it('creates a valid Audit event', () => {
      const event = createAuditEvent();

      expect(event.getId().getValue()).toBe('audit-event-1');
      expect(event.getEventType()).toBe(
        ACCESS_CONTROL_AUDIT_EVENT_TYPE.ROLE_ASSIGNED,
      );
      expect(event.getOrganizationId()).toBe('organization-1');
      expect(event.getBranchId()).toBe('branch-1');
      expect(event.getActorUserId()).toBe('actor-1');
      expect(event.getSubjectReference()?.getId()).toBe('user-1');
      expect(event.getResourceReference().getId()).toBe('role-1');
      expect(event.getCorrelationId()).toBe('request-1');
      expect(event.getBeforeState()).toBeNull();
      expect(event.getAfterState()).toEqual({
        permissionCodes: ['branch.staff.read'],
      });
    });

    it('normalizes required identifiers', () => {
      const event = createAuditEvent({
        organizationId: '  organization-1  ',
        actorUserId: '  actor-1  ',
        id: '  audit-event-1  ',
      });

      expect(event.getOrganizationId()).toBe('organization-1');
      expect(event.getActorUserId()).toBe('actor-1');
      expect(event.getId().getValue()).toBe('audit-event-1');
    });

    it('normalizes optional identifiers', () => {
      const event = createAuditEvent({
        branchId: '  branch-1  ',
        correlationId: '  request-1  ',
      });

      expect(event.getBranchId()).toBe('branch-1');
      expect(event.getCorrelationId()).toBe('request-1');
    });

    it('allows an Organization-scoped event without a Branch ID', () => {
      const event = createAuditEvent({
        branchId: null,
      });

      expect(event.getBranchId()).toBeNull();
    });

    it('allows an event without a Subject reference', () => {
      const event = createAuditEvent({
        subjectReference: null,
      });

      expect(event.getSubjectReference()).toBeNull();
    });

    it('allows an event without a Correlation ID', () => {
      const event = createAuditEvent({
        correlationId: null,
      });

      expect(event.getCorrelationId()).toBeNull();
    });

    it('generates an ID when one is not supplied', () => {
      const first = createAuditEvent({ id: undefined });
      const second = createAuditEvent({ id: undefined });

      expect(first.getId().getValue()).toBeTruthy();
      expect(second.getId().getValue()).toBeTruthy();
      expect(first.equals(second)).toBe(false);
    });

    it('accepts an AUTHORIZATION_DENIED event without a resource ID', () => {
      const event = createAuditEvent({
        eventType: ACCESS_CONTROL_AUDIT_EVENT_TYPE.AUTHORIZATION_DENIED,
        resourceReference: AuditResourceReference.create({
          type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
          id: null,
        }),
      });

      expect(event.getEventType()).toBe(
        ACCESS_CONTROL_AUDIT_EVENT_TYPE.AUTHORIZATION_DENIED,
      );
      expect(event.getResourceReference().hasId()).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects an unknown event type', () => {
      expect(() =>
        createAuditEvent({
          eventType: 'UNKNOWN' as AccessControlAuditEventType,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.EVENT_TYPE_INVALID,
        }),
      );
    });

    it('rejects an invalid Resource reference', () => {
      expect(() =>
        createAuditEvent({
          resourceReference: {} as AuditResourceReference,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_TYPE_INVALID,
        }),
      );
    });

    it('rejects an invalid Subject reference', () => {
      expect(() =>
        createAuditEvent({
          subjectReference: {} as AuditSubjectReference,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.SUBJECT_TYPE_INVALID,
        }),
      );
    });

    it('rejects an empty Organization ID', () => {
      expect(() =>
        createAuditEvent({
          organizationId: ' ',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        }),
      );
    });

    it('rejects an empty Actor User ID', () => {
      expect(() =>
        createAuditEvent({
          actorUserId: ' ',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.ACTOR_USER_ID_REQUIRED,
        }),
      );
    });

    it('rejects an empty Audit event ID', () => {
      expect(() =>
        createAuditEvent({
          id: ' ',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.ID_INVALID,
        }),
      );
    });

    it('rejects an empty Branch ID', () => {
      expect(() =>
        createAuditEvent({
          branchId: ' ',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.BRANCH_ID_INVALID,
        }),
      );
    });

    it('rejects an empty Correlation ID', () => {
      expect(() =>
        createAuditEvent({
          correlationId: ' ',
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.CORRELATION_ID_INVALID,
        }),
      );
    });

    it('rejects a Correlation ID longer than 128 characters', () => {
      expect(() =>
        createAuditEvent({
          correlationId: 'a'.repeat(129),
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.CORRELATION_ID_INVALID,
        }),
      );
    });

    it('accepts a Correlation ID with exactly 128 characters', () => {
      const correlationId = 'a'.repeat(128);

      const event = createAuditEvent({
        correlationId,
      });

      expect(event.getCorrelationId()).toBe(correlationId);
    });

    it('rejects an unresolved Resource for a successful event', () => {
      const unresolvedResource = AuditResourceReference.create({
        type: ACCESS_CONTROL_AUDIT_RESOURCE_TYPE.AUTHORIZATION,
        id: null,
      });

      expect(() =>
        createAuditEvent({
          eventType: ACCESS_CONTROL_AUDIT_EVENT_TYPE.ROLE_CREATED,
          resourceReference: unresolvedResource,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.RESOURCE_ID_REQUIRED,
        }),
      );
    });

    it('throws an InvalidAccessControlAuditEventError for invalid data', () => {
      try {
        createAuditEvent({
          organizationId: ' ',
        });

        expect.fail('Expected an error to be thrown.');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidAccessControlAuditEventError);
      }
    });
  });

  describe('state snapshots', () => {
    it('preserves before and after states', () => {
      const event = createAuditEvent({
        beforeState: {
          name: 'Old Role',
        },
        afterState: {
          name: 'New Role',
          permissionCodes: ['branch.staff.read'],
        },
      });

      expect(event.getBeforeState()).toEqual({
        name: 'Old Role',
      });

      expect(event.getAfterState()).toEqual({
        name: 'New Role',
        permissionCodes: ['branch.staff.read'],
      });
    });

    it('returns null when before and after states are omitted', () => {
      const event = createAuditEvent({
        beforeState: undefined,
        afterState: undefined,
      });

      expect(event.getBeforeState()).toBeNull();
      expect(event.getAfterState()).toBeNull();
    });

    it('copies the provided state instead of retaining the original object', () => {
      const permissionCodes = ['branch.staff.read'];

      const event = createAuditEvent({
        afterState: {
          permissionCodes,
        },
      });

      permissionCodes.push('branch.staff.invite');

      expect(event.getAfterState()).toEqual({
        permissionCodes: ['branch.staff.read'],
      });
    });

    it('freezes the state snapshot', () => {
      const event = createAuditEvent();

      const state = event.getAfterState();

      expect(state).not.toBeNull();
      expect(Object.isFrozen(state)).toBe(true);
    });

    it('freezes arrays inside the state snapshot', () => {
      const event = createAuditEvent();

      const state = event.getAfterState();

      expect(state).not.toBeNull();
      expect(Object.isFrozen(state?.permissionCodes)).toBe(true);
    });
  });

  describe('equality', () => {
    it('considers two events with the same ID equal', () => {
      const first = createAuditEvent();
      const second = createAuditEvent();

      expect(first.equals(second)).toBe(true);
    });

    it('considers events with different IDs unequal', () => {
      const first = createAuditEvent();
      const second = createAuditEvent({
        id: 'audit-event-2',
      });

      expect(first.equals(second)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('freezes the Audit event after creation', () => {
      const event = createAuditEvent();

      expect(Object.isFrozen(event)).toBe(true);
    });
  });
});
