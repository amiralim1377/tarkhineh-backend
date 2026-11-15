import { describe, expect, it } from 'vitest';

import {
  ACCESS_CONTROL_AUDIT_SUBJECT_TYPE,
  type AccessControlAuditSubjectType,
} from '../access-control-audit-event.types.js';

import {
  AuditSubjectReference,
  type CreateAuditSubjectReferenceProps,
} from './audit-subject-reference.vo.js';
import {
  ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE,
  InvalidAccessControlAuditEventError,
} from '../../errors/invalid-access-control-audit-event.error.js';

function createAuditSubject(
  overrides: Partial<CreateAuditSubjectReferenceProps> = {},
): AuditSubjectReference {
  return AuditSubjectReference.create({
    type: ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.USER,
    id: 'user-1',
    ...overrides,
  });
}

describe('AuditSubjectReference', () => {
  describe('creation', () => {
    it('creates a User subject reference', () => {
      const subject = createAuditSubject();

      expect(subject.getType()).toBe(ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.USER);
      expect(subject.getId()).toBe('user-1');
    });

    it('creates an OrganizationMembership subject reference', () => {
      const subject = createAuditSubject({
        type: ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.ORGANIZATION_MEMBERSHIP,
        id: 'organization-membership-1',
      });

      expect(subject.getType()).toBe(
        ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.ORGANIZATION_MEMBERSHIP,
      );
      expect(subject.getId()).toBe('organization-membership-1');
    });

    it('creates a BranchMembership subject reference', () => {
      const subject = createAuditSubject({
        type: ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.BRANCH_MEMBERSHIP,
        id: 'branch-membership-1',
      });

      expect(subject.getType()).toBe(
        ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.BRANCH_MEMBERSHIP,
      );
      expect(subject.getId()).toBe('branch-membership-1');
    });

    it('normalizes the subject ID', () => {
      const subject = createAuditSubject({
        id: '  user-1  ',
      });

      expect(subject.getId()).toBe('user-1');
    });

    it('rejects an unknown subject type', () => {
      expect(() =>
        createAuditSubject({
          type: 'UNKNOWN' as AccessControlAuditSubjectType,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.SUBJECT_TYPE_INVALID,
        }),
      );
    });

    it('rejects an empty subject ID', () => {
      expect(() => createAuditSubject({ id: '' })).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.SUBJECT_ID_INVALID,
        }),
      );
    });

    it('rejects a whitespace-only subject ID', () => {
      expect(() => createAuditSubject({ id: '   ' })).toThrowError(
        expect.objectContaining({
          code: ACCESS_CONTROL_AUDIT_EVENT_ERROR_CODE.SUBJECT_ID_INVALID,
        }),
      );
    });

    it('throws an InvalidAccessControlAuditEventError for invalid data', () => {
      try {
        createAuditSubject({ id: ' ' });
        expect.fail('Expected an error to be thrown.');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidAccessControlAuditEventError);
      }
    });
  });

  describe('equality', () => {
    it('considers two references with the same type and ID equal', () => {
      const first = createAuditSubject();
      const second = createAuditSubject();

      expect(first.equals(second)).toBe(true);
    });

    it('considers references with different IDs unequal', () => {
      const first = createAuditSubject();
      const second = createAuditSubject({ id: 'user-2' });

      expect(first.equals(second)).toBe(false);
    });

    it('considers references with different types unequal', () => {
      const first = createAuditSubject();

      const second = createAuditSubject({
        type: ACCESS_CONTROL_AUDIT_SUBJECT_TYPE.BRANCH_MEMBERSHIP,
      });

      expect(first.equals(second)).toBe(false);
    });

    it('returns false when comparing with null', () => {
      const subject = createAuditSubject();

      expect(subject.equals(null)).toBe(false);
    });

    it('returns false when comparing with undefined', () => {
      const subject = createAuditSubject();

      expect(subject.equals(undefined)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('freezes the Value Object after creation', () => {
      const subject = createAuditSubject();

      expect(Object.isFrozen(subject)).toBe(true);
    });
  });
});
