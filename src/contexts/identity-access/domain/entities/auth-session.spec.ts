import { describe, expect, it } from 'vitest';

import { AuthSession } from './auth-session.js';
import { InvalidAuthSessionDataError } from '../errors/invalid-auth-session-data.error.js';
import type {
  AuthSessionProps,
  AuthSessionRevocationReason,
} from './auth-session.js';

const CREATED_AT = new Date('2026-10-19T10:00:00.000Z');
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_EXPIRES_AT = new Date(
  CREATED_AT.getTime() + SESSION_TTL_SECONDS * 1000,
);

function createSession(): AuthSession {
  return AuthSession.create({
    id: 'session-123',
    userId: 'user-123',
    createdAt: CREATED_AT,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
  });
}

function createPersistedSession(
  overrides: Partial<AuthSessionProps> = {},
): AuthSessionProps {
  return {
    id: 'session-123',
    userId: 'user-123',
    createdAt: CREATED_AT,
    lastUsedAt: CREATED_AT,
    expiresAt: SESSION_EXPIRES_AT,
    revokedAt: null,
    revocationReason: null,
    ...overrides,
  };
}

describe('AuthSession', () => {
  describe('create', () => {
    it('creates a new active session with the calculated expiry', () => {
      const session = createSession();

      expect(session.id).toBe('session-123');
      expect(session.userId).toBe('user-123');
      expect(session.createdAt).toEqual(CREATED_AT);
      expect(session.lastUsedAt).toEqual(CREATED_AT);
      expect(session.expiresAt).toEqual(SESSION_EXPIRES_AT);
      expect(session.revokedAt).toBeNull();
      expect(session.revocationReason).toBeNull();
    });

    it('generates a unique ID when one is not provided', () => {
      const first = AuthSession.create({
        userId: 'user-123',
        createdAt: CREATED_AT,
        sessionTtlSeconds: SESSION_TTL_SECONDS,
      });

      const second = AuthSession.create({
        userId: 'user-123',
        createdAt: CREATED_AT,
        sessionTtlSeconds: SESSION_TTL_SECONDS,
      });

      expect(first.id).toBeTruthy();
      expect(second.id).toBeTruthy();
      expect(first.equals(second)).toBe(false);
    });

    it('recognizes sessions with the same ID as the same entity', () => {
      const first = createSession();

      const second = AuthSession.create({
        id: 'session-123',
        userId: 'another-user',
        createdAt: CREATED_AT,
        sessionTtlSeconds: SESSION_TTL_SECONDS,
      });

      expect(first).not.toBe(second);
      expect(first.equals(second)).toBe(true);
    });

    it('rejects an empty user ID', () => {
      expect(() =>
        AuthSession.create({
          userId: ' ',
          createdAt: CREATED_AT,
          sessionTtlSeconds: SESSION_TTL_SECONDS,
        }),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an invalid creation date', () => {
      expect(() =>
        AuthSession.create({
          userId: 'user-123',
          createdAt: new Date(Number.NaN),
          sessionTtlSeconds: SESSION_TTL_SECONDS,
        }),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects an invalid session TTL: %s',
      (sessionTtlSeconds) => {
        expect(() =>
          AuthSession.create({
            userId: 'user-123',
            createdAt: CREATED_AT,
            sessionTtlSeconds,
          }),
        ).toThrow(InvalidAuthSessionDataError);
      },
    );

    it('rejects a TTL that produces an invalid expiry date', () => {
      expect(() =>
        AuthSession.create({
          userId: 'user-123',
          createdAt: CREATED_AT,
          sessionTtlSeconds: Number.MAX_SAFE_INTEGER,
        }),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('does not expose the original creation date for mutation', () => {
      const inputDate = new Date(CREATED_AT.getTime());

      const session = AuthSession.create({
        userId: 'user-123',
        createdAt: inputDate,
        sessionTtlSeconds: SESSION_TTL_SECONDS,
      });

      inputDate.setUTCFullYear(2030);

      expect(session.createdAt).toEqual(CREATED_AT);
    });
  });

  describe('reconstitute', () => {
    it('reconstitutes an existing session', () => {
      const session = AuthSession.reconstitute(createPersistedSession());

      expect(session.id).toBe('session-123');
      expect(session.userId).toBe('user-123');
      expect(session.createdAt).toEqual(CREATED_AT);
      expect(session.lastUsedAt).toEqual(CREATED_AT);
      expect(session.expiresAt).toEqual(SESSION_EXPIRES_AT);
      expect(session.revokedAt).toBeNull();
      expect(session.revocationReason).toBeNull();
    });

    it('preserves a revoked session state', () => {
      const revokedAt = new Date('2026-10-19T12:00:00.000Z');

      const session = AuthSession.reconstitute(
        createPersistedSession({
          revokedAt,
          revocationReason: 'LOGOUT',
        }),
      );

      expect(session.revokedAt).toEqual(revokedAt);
      expect(session.revocationReason).toBe('LOGOUT');
      expect(session.isActiveAt(revokedAt)).toBe(false);
    });

    it('rejects an empty session ID', () => {
      expect(() =>
        AuthSession.reconstitute(createPersistedSession({ id: ' ' })),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an empty user ID', () => {
      expect(() =>
        AuthSession.reconstitute(createPersistedSession({ userId: ' ' })),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an invalid creation date', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            createdAt: new Date(Number.NaN),
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an invalid expiry date', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            expiresAt: new Date(Number.NaN),
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an expiry that precedes creation', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            expiresAt: CREATED_AT,
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects a last-used date that precedes creation', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            lastUsedAt: new Date(CREATED_AT.getTime() - 1000),
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an invalid last-used date', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            lastUsedAt: new Date(Number.NaN),
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects a revocation date that precedes creation', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            revokedAt: new Date(CREATED_AT.getTime() - 1000),
            revocationReason: 'LOGOUT',
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects a revoked session without a revocation reason', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            revokedAt: new Date('2026-10-19T12:00:00.000Z'),
            revocationReason: null,
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects a revocation reason without a revocation date', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            revokedAt: null,
            revocationReason: 'LOGOUT',
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects an unsupported revocation reason', () => {
      expect(() =>
        AuthSession.reconstitute(
          createPersistedSession({
            revokedAt: new Date('2026-10-19T12:00:00.000Z'),
            revocationReason: 'UNKNOWN' as AuthSessionRevocationReason,
          }),
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });
  });

  describe('getters', () => {
    it('returns defensive copies of date properties', () => {
      const session = createSession();

      const createdAt = session.createdAt;
      const lastUsedAt = session.lastUsedAt;
      const expiresAt = session.expiresAt;

      createdAt.setUTCFullYear(2030);
      lastUsedAt?.setUTCFullYear(2030);
      expiresAt.setUTCFullYear(2030);

      expect(session.createdAt).toEqual(CREATED_AT);
      expect(session.lastUsedAt).toEqual(CREATED_AT);
      expect(session.expiresAt).toEqual(SESSION_EXPIRES_AT);
    });

    it('returns defensive copies of nullable date properties', () => {
      const revokedAt = new Date('2026-10-19T12:00:00.000Z');

      const session = AuthSession.reconstitute(
        createPersistedSession({ revokedAt, revocationReason: 'LOGOUT' }),
      );

      const returnedRevokedAt = session.revokedAt;
      returnedRevokedAt?.setUTCFullYear(2030);

      expect(session.revokedAt).toEqual(revokedAt);
    });
  });

  describe('isActiveAt', () => {
    it('returns true before expiry for a non-revoked session', () => {
      const session = createSession();

      expect(session.isActiveAt(new Date('2026-10-19T12:00:00.000Z'))).toBe(
        true,
      );
    });

    it('returns true exactly at creation time', () => {
      const session = createSession();

      expect(session.isActiveAt(CREATED_AT)).toBe(true);
    });

    it('returns false before creation', () => {
      const session = createSession();

      expect(session.isActiveAt(new Date(CREATED_AT.getTime() - 1))).toBe(
        false,
      );
    });

    it('returns false exactly at expiry', () => {
      const session = createSession();

      expect(session.isActiveAt(SESSION_EXPIRES_AT)).toBe(false);
    });

    it('returns false after expiry', () => {
      const session = createSession();

      expect(
        session.isActiveAt(new Date(SESSION_EXPIRES_AT.getTime() + 1)),
      ).toBe(false);
    });

    it('returns false after revocation', () => {
      const session = createSession();
      const revokedAt = new Date('2026-10-19T12:00:00.000Z');

      session.revoke(revokedAt, 'LOGOUT');

      expect(session.isActiveAt(new Date('2026-10-19T13:00:00.000Z'))).toBe(
        false,
      );
    });

    it('returns false for an invalid date', () => {
      const session = createSession();

      expect(session.isActiveAt(new Date(Number.NaN))).toBe(false);
    });
  });

  describe('calculateRefreshTokenExpiresAt', () => {
    it('calculates expiry based on the refresh token TTL', () => {
      const session = createSession();
      const issuedAt = new Date('2026-10-19T12:00:00.000Z');
      const ttlSeconds = 60 * 60;

      const expiresAt = session.calculateRefreshTokenExpiresAt(
        issuedAt,
        ttlSeconds,
      );

      expect(expiresAt).toEqual(
        new Date(issuedAt.getTime() + ttlSeconds * 1000),
      );
    });

    it('does not let a refresh token outlive its session', () => {
      const session = createSession();
      const issuedAt = new Date('2026-10-19T17:00:00.000Z');

      const expiresAt = session.calculateRefreshTokenExpiresAt(
        issuedAt,
        7 * 24 * 60 * 60,
      );

      expect(expiresAt).toEqual(SESSION_EXPIRES_AT);
    });

    it('rejects an invalid issuance date', () => {
      const session = createSession();

      expect(() =>
        session.calculateRefreshTokenExpiresAt(new Date(Number.NaN), 60),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects an invalid refresh token TTL: %s',
      (ttlSeconds) => {
        const session = createSession();

        expect(() =>
          session.calculateRefreshTokenExpiresAt(
            new Date('2026-10-19T12:00:00.000Z'),
            ttlSeconds,
          ),
        ).toThrow(InvalidAuthSessionDataError);
      },
    );

    it('rejects issuing a refresh token before session creation', () => {
      const session = createSession();

      expect(() =>
        session.calculateRefreshTokenExpiresAt(
          new Date(CREATED_AT.getTime() - 1),
          60,
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects issuing a refresh token at session expiry', () => {
      const session = createSession();

      expect(() =>
        session.calculateRefreshTokenExpiresAt(SESSION_EXPIRES_AT, 60),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('rejects issuing a refresh token after session revocation', () => {
      const session = createSession();
      session.revoke(new Date('2026-10-19T12:00:00.000Z'), 'LOGOUT');

      expect(() =>
        session.calculateRefreshTokenExpiresAt(
          new Date('2026-10-19T13:00:00.000Z'),
          60,
        ),
      ).toThrow(InvalidAuthSessionDataError);
    });

    it('returns a defensive copy of the calculated expiry', () => {
      const session = createSession();

      const result = session.calculateRefreshTokenExpiresAt(
        new Date('2026-10-19T12:00:00.000Z'),
        60,
      );

      result.setUTCFullYear(2030);

      expect(
        session.calculateRefreshTokenExpiresAt(
          new Date('2026-10-19T12:00:00.000Z'),
          60,
        ),
      ).toEqual(new Date('2026-10-19T12:01:00.000Z'));
    });
  });

  describe('recordActivity', () => {
    it('records activity for an active session', () => {
      const session = createSession();
      const activityAt = new Date('2026-10-19T12:00:00.000Z');

      expect(session.recordActivity(activityAt)).toBe(true);
      expect(session.lastUsedAt).toEqual(activityAt);
    });

    it('does not record activity for an expired session', () => {
      const session = createSession();

      expect(session.recordActivity(SESSION_EXPIRES_AT)).toBe(false);
      expect(session.lastUsedAt).toEqual(CREATED_AT);
    });

    it('does not record activity for a revoked session', () => {
      const session = createSession();
      session.revoke(new Date('2026-10-19T12:00:00.000Z'), 'LOGOUT');

      expect(session.recordActivity(new Date('2026-10-19T13:00:00.000Z'))).toBe(
        false,
      );
    });

    it('does not move last-used time backwards', () => {
      const session = createSession();
      const firstActivity = new Date('2026-10-19T12:00:00.000Z');

      expect(session.recordActivity(firstActivity)).toBe(true);

      expect(session.recordActivity(new Date('2026-10-19T11:00:00.000Z'))).toBe(
        false,
      );

      expect(session.lastUsedAt).toEqual(firstActivity);
    });

    it('rejects an invalid activity date', () => {
      const session = createSession();

      expect(session.recordActivity(new Date(Number.NaN))).toBe(false);
      expect(session.lastUsedAt).toEqual(CREATED_AT);
    });
  });

  describe('revoke', () => {
    it('revokes a session and records the reason', () => {
      const session = createSession();
      const revokedAt = new Date('2026-10-19T12:00:00.000Z');

      expect(session.revoke(revokedAt, 'LOGOUT')).toBe(true);
      expect(session.revokedAt).toEqual(revokedAt);
      expect(session.revocationReason).toBe('LOGOUT');
      expect(session.isActiveAt(revokedAt)).toBe(false);
    });

    it.each(['LOGOUT', 'REFRESH_TOKEN_REUSE', 'SECURITY_ACTION'] as const)(
      'supports the %s revocation reason',
      (reason) => {
        const session = createSession();
        const revokedAt = new Date('2026-10-19T12:00:00.000Z');

        expect(session.revoke(revokedAt, reason)).toBe(true);
        expect(session.revocationReason).toBe(reason);
      },
    );

    it('does not revoke an already revoked session again', () => {
      const session = createSession();
      const revokedAt = new Date('2026-10-19T12:00:00.000Z');

      session.revoke(revokedAt, 'LOGOUT');

      expect(
        session.revoke(new Date('2026-10-19T12:01:00.000Z'), 'SECURITY_ACTION'),
      ).toBe(false);

      expect(session.revocationReason).toBe('LOGOUT');
      expect(session.revokedAt).toEqual(revokedAt);
    });

    it('rejects an invalid revocation date', () => {
      const session = createSession();

      expect(session.revoke(new Date(Number.NaN), 'LOGOUT')).toBe(false);

      expect(session.revokedAt).toBeNull();
      expect(session.revocationReason).toBeNull();
    });

    it('rejects a revocation date before creation', () => {
      const session = createSession();

      expect(session.revoke(new Date(CREATED_AT.getTime() - 1), 'LOGOUT')).toBe(
        false,
      );

      expect(session.revokedAt).toBeNull();
    });
  });
});
