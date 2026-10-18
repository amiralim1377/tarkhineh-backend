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
    const originalVerifiedAt = new Date('2026-10-18T11:00:00.000Z');

    const user = IdentityUser.reconstitute({
      id: 'user-123',
      email: 'customer@example.com',
      emailVerifiedAt: originalVerifiedAt,
      passwordHash: 'test-hash',
      displayName: 'Customer',
      status: 'ACTIVE',
    });

    const result = user.verifyEmail(new Date('2026-10-18T12:00:00.000Z'));

    expect(result).toBe(false);
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).toEqual(originalVerifiedAt);
  });

  it('does not verify a suspended user', () => {
    const user = IdentityUser.reconstitute({
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
    const user = IdentityUser.reconstitute({
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

  it('generates a unique ID when registering a new user without an ID', () => {
    const firstUser = IdentityUser.registerPending({
      email: 'first@example.com',
      passwordHash: 'test-hash',
      displayName: 'First',
    });

    const secondUser = IdentityUser.registerPending({
      email: 'second@example.com',
      passwordHash: 'test-hash',
      displayName: 'Second',
    });

    expect(firstUser.id).toBeTruthy();
    expect(firstUser.getId().getValue()).toBe(firstUser.id);
    expect(firstUser.equals(secondUser)).toBe(false);
  });

  it('recognizes two instances with the same ID as the same entity', () => {
    const firstUser = IdentityUser.registerPending({
      id: 'existing-user-123',
      email: 'customer@example.com',
      passwordHash: 'test-hash',
      displayName: 'Customer',
    });

    const secondUser = IdentityUser.registerPending({
      id: 'existing-user-123',
      email: 'customer@example.com',
      passwordHash: 'test-hash',
      displayName: 'Customer',
    });

    expect(firstUser).not.toBe(secondUser);
    expect(firstUser.equals(secondUser)).toBe(true);
  });

  it('creates a verified active identity', () => {
    const emailVerifiedAt = new Date('2026-10-18T12:00:00.000Z');

    const user = IdentityUser.provisionVerified({
      email: 'admin@example.com',
      emailVerifiedAt,
      passwordHash: 'test-hash',
      displayName: 'Central Admin',
    });

    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).toEqual(emailVerifiedAt);
    expect(user.canLoginWithPassword()).toBe(true);
  });

  it('rejects an invalid email verification date when provisioning', () => {
    expect(() =>
      IdentityUser.provisionVerified({
        email: 'admin@example.com',
        emailVerifiedAt: new Date(Number.NaN),
        passwordHash: 'test-hash',
        displayName: 'Central Admin',
      }),
    ).toThrow('Email verification date must be valid.');
  });
});
