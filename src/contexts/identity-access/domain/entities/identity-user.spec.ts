import { describe, expect, it } from 'vitest';

import { IdentityUser } from './identity-user.js';

describe('IdentityUser', () => {
  const registrationInput = {
    id: 'user-123',
    email: 'customer@example.com',
    passwordHash: 'test-hash',
    displayName: 'Customer',
  };

  it('creates a pending user with an unverified email', () => {
    const user = IdentityUser.registerPending(registrationInput);

    expect(user.id).toBe('user-123');
    expect(user.email).toBe('customer@example.com');
    expect(user.status).toBe('PENDING');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.canLoginWithPassword()).toBe(false);
  });

  it('activates a pending user when email verification succeeds', () => {
    const user = IdentityUser.registerPending(registrationInput);
    const verifiedAt = new Date('2026-10-18T12:00:00.000Z');

    const result = user.verifyEmail(verifiedAt);

    expect(result).toBe(true);
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).toEqual(verifiedAt);
    expect(user.canLoginWithPassword()).toBe(true);
  });

  it('does not verify an already active user', () => {
    const user = new IdentityUser({
      id: 'user-123',
      email: 'customer@example.com',
      emailVerifiedAt: new Date('2026-10-18T11:00:00.000Z'),
      passwordHash: 'test-hash',
      displayName: 'Customer',
      status: 'ACTIVE',
    });

    const originalVerifiedAt = user.emailVerifiedAt;
    const result = user.verifyEmail(new Date('2026-10-18T12:00:00.000Z'));

    expect(result).toBe(false);
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).toEqual(originalVerifiedAt);
  });

  it('does not verify a suspended user', () => {
    const user = new IdentityUser({
      id: 'user-123',
      email: 'customer@example.com',
      emailVerifiedAt: null,
      passwordHash: 'test-hash',
      displayName: 'Customer',
      status: 'SUSPENDED',
    });

    const result = user.verifyEmail(new Date('2026-10-18T12:00:00.000Z'));

    expect(result).toBe(false);
    expect(user.status).toBe('SUSPENDED');
    expect(user.emailVerifiedAt).toBeNull();
  });

  it('does not verify a user without an email address', () => {
    const user = new IdentityUser({
      id: 'user-123',
      email: null,
      emailVerifiedAt: null,
      passwordHash: 'test-hash',
      displayName: 'Customer',
      status: 'PENDING',
    });

    const result = user.verifyEmail(new Date('2026-10-18T12:00:00.000Z'));

    expect(result).toBe(false);
    expect(user.status).toBe('PENDING');
    expect(user.emailVerifiedAt).toBeNull();
  });
});
