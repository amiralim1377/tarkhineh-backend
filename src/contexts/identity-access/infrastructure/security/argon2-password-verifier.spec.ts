import { hash } from 'argon2';
import { describe, expect, it } from 'vitest';

import { Argon2PasswordVerifier } from './argon2-password-verifier.js';

describe('Argon2PasswordVerifier', () => {
  const verifier = new Argon2PasswordVerifier();

  it('accepts the correct password for a valid Argon2 hash', async () => {
    const plainPassword = 'CorrectPassword123!';
    const passwordHash = await hash(plainPassword);

    await expect(
      verifier.verify(passwordHash, plainPassword),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password for a valid Argon2 hash', async () => {
    const passwordHash = await hash('CorrectPassword123!');

    await expect(
      verifier.verify(passwordHash, 'WrongPassword123!'),
    ).resolves.toBe(false);
  });
});
