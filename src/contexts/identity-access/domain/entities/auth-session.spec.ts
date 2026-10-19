import { describe, expect, it } from 'vitest';

import { AuthSession } from './auth-session.js';
import { InvalidAuthSessionDataError } from '../errors/invalid-auth-session-data.error.js';

describe('AuthSession', () => {
  const createdAt = new Date('2026-10-19T10:00:00.000Z');
  const expiresAt = new Date('2026-10-19T18:00:00.000Z');

  const createSession = () =>
    AuthSession.create({
      id: 'session-123',
      userId: 'user-123',
      createdAt,
      expiresAt,
    });

  it('creates a new active session', () => {
    const session = createSession();

    expect(session.id).toBe('session-123');
    expect(session.userId).toBe('user-123');
    expect(session.createdAt).toEqual(createdAt);
    expect(session.lastUsedAt).toEqual(createdAt);
    expect(session.expiresAt).toEqual(expiresAt);
    expect(session.revokedAt).toBeNull();
    expect(session.revocationReason).toBeNull();
  });

  it('generates a unique ID when one is not provided', () => {
    const first = AuthSession.create({
      userId: 'user-123',
      createdAt,
      expiresAt,
    });

    const second = AuthSession.create({
      userId: 'user-123',
      createdAt,
      expiresAt,
    });

    expect(first.id).toBeTruthy();
    expect(first.equals(second)).toBe(false);
  });

  it('recognizes the session as active before expiration', () => {
    const session = createSession();

    expect(session.isActiveAt(new Date('2026-10-19T12:00:00.000Z'))).toBe(true);
  });

  it('recognizes the session as inactive at expiration', () => {
    const session = createSession();

    expect(session.isActiveAt(expiresAt)).toBe(false);
  });

  it('records activity for an active session', () => {
    const session = createSession();
    const activityAt = new Date('2026-10-19T12:00:00.000Z');

    expect(session.recordActivity(activityAt)).toBe(true);
    expect(session.lastUsedAt).toEqual(activityAt);
  });

  it('does not record activity for an expired session', () => {
    const session = createSession();

    expect(session.recordActivity(expiresAt)).toBe(false);
    expect(session.lastUsedAt).toEqual(createdAt);
  });

  it('revokes an active session and records the reason', () => {
    const session = createSession();
    const revokedAt = new Date('2026-10-19T12:00:00.000Z');

    expect(session.revoke(revokedAt, 'LOGOUT')).toBe(true);
    expect(session.revokedAt).toEqual(revokedAt);
    expect(session.revocationReason).toBe('LOGOUT');
    expect(session.isActiveAt(revokedAt)).toBe(false);
  });

  it('does not revoke an already revoked session again', () => {
    const session = createSession();
    const revokedAt = new Date('2026-10-19T12:00:00.000Z');

    session.revoke(revokedAt, 'LOGOUT');

    expect(
      session.revoke(new Date('2026-10-19T13:00:00.000Z'), 'SECURITY_ACTION'),
    ).toBe(false);

    expect(session.revocationReason).toBe('LOGOUT');
    expect(session.revokedAt).toEqual(revokedAt);
  });

  it('rejects a session that expires before or at creation', () => {
    expect(() =>
      AuthSession.create({
        userId: 'user-123',
        createdAt,
        expiresAt: createdAt,
      }),
    ).toThrow(InvalidAuthSessionDataError);
  });

  it('rejects a revoked session without a revocation reason', () => {
    expect(() =>
      AuthSession.reconstitute({
        id: 'session-123',
        userId: 'user-123',
        createdAt,
        lastUsedAt: createdAt,
        expiresAt,
        revokedAt: new Date('2026-10-19T12:00:00.000Z'),
        revocationReason: null,
      }),
    ).toThrow(InvalidAuthSessionDataError);
  });
});
