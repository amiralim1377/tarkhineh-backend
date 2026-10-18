import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';

import { AesGcmEmailTokenEncryptor } from './aes-gcm-email-token-encryptor.js';

const testKey = Buffer.alloc(32, 7).toString('base64');

function createEncryptor(): AesGcmEmailTokenEncryptor {
  const configService = {
    getOrThrow: vi.fn().mockReturnValue(testKey),
  } as unknown as ConfigService;

  return new AesGcmEmailTokenEncryptor(configService);
}

describe('AesGcmEmailTokenEncryptor', () => {
  it('encrypts and decrypts a token', () => {
    const encryptor = createEncryptor();
    const token = 'test-email-verification-token';

    const encrypted = encryptor.encrypt(token);

    expect(encrypted).not.toContain(token);
    expect(encrypted).toMatch(/^v1:/);
    expect(encryptor.decrypt(encrypted)).toBe(token);
  });

  it('uses a different encrypted value for each encryption', () => {
    const encryptor = createEncryptor();
    const token = 'test-email-verification-token';

    expect(encryptor.encrypt(token)).not.toBe(encryptor.encrypt(token));
  });

  it('rejects a tampered token', () => {
    const encryptor = createEncryptor();
    const encrypted = encryptor.encrypt('test-email-verification-token');

    const payload = encrypted.slice(3);
    const firstCharacter = payload[0] === 'A' ? 'B' : 'A';
    const tampered = `v1:${firstCharacter}${payload.slice(1)}`;

    expect(() => encryptor.decrypt(tampered)).toThrow(
      'Unable to decrypt email token payload',
    );
  });

  it('rejects an invalid encryption key', () => {
    const configService = {
      getOrThrow: vi.fn().mockReturnValue('invalid-key'),
    } as unknown as ConfigService;

    expect(() => new AesGcmEmailTokenEncryptor(configService)).toThrow(
      'EMAIL_TOKEN_ENCRYPTION_KEY',
    );
  });
});
