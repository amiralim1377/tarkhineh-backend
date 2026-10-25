import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PasswordPolicy,
} from './password-policy.js';

describe('PasswordPolicy', () => {
  let passwordPolicy: PasswordPolicy;

  beforeEach(() => {
    passwordPolicy = new PasswordPolicy();
  });

  describe('isValid', () => {
    it('accepts a password with minimum length and an uppercase letter', () => {
      expect(passwordPolicy.isValid('Abcdefg1')).toBe(true);
    });

    it('rejects a password shorter than the minimum length', () => {
      expect(passwordPolicy.isValid('Abc123!')).toBe(false);
    });

    it('rejects a password without an uppercase letter', () => {
      expect(passwordPolicy.isValid('abcdefg123!')).toBe(false);
    });

    it('accepts a password without special characters', () => {
      expect(passwordPolicy.isValid('Password123')).toBe(true);
    });

    it('accepts a password with special characters', () => {
      expect(passwordPolicy.isValid('Password123!@')).toBe(true);
    });

    it('accepts a password at the maximum length', () => {
      const password = 'A' + 'a'.repeat(MAX_PASSWORD_LENGTH - 1);

      expect(passwordPolicy.isValid(password)).toBe(true);
    });

    it('rejects a password exceeding the maximum length', () => {
      const password = 'A' + 'a'.repeat(MAX_PASSWORD_LENGTH);

      expect(passwordPolicy.isValid(password)).toBe(false);
    });

    it('uses the expected password length limits', () => {
      expect(MIN_PASSWORD_LENGTH).toBe(8);
      expect(MAX_PASSWORD_LENGTH).toBe(1024);
    });
  });
});
