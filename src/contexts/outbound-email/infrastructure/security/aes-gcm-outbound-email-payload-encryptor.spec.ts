import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AesGcmOutboundEmailPayloadEncryptor } from './aes-gcm-outbound-email-payload-encryptor.js';

const testKey = Buffer.alloc(32, 23).toString('base64');

function createEncryptor(
  encodedKey = testKey,
): AesGcmOutboundEmailPayloadEncryptor {
  const configService = {
    getOrThrow: vi.fn().mockReturnValue(encodedKey),
  } as unknown as ConfigService;

  return new AesGcmOutboundEmailPayloadEncryptor(configService);
}

describe('AesGcmOutboundEmailPayloadEncryptor', () => {
  it('encrypts and decrypts a payload', () => {
    const encryptor = createEncryptor();
    const plaintext = JSON.stringify({
      to: 'recipient@example.test',
      subject: 'Welcome',
      text: 'Welcome to Tarkhineh',
    });

    const encrypted = encryptor.encrypt(plaintext);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('recipient@example.test');
    expect(encryptor.decrypt(encrypted)).toBe(plaintext);
  });

  it('generates different ciphertext for identical plaintext', () => {
    const encryptor = createEncryptor();
    const plaintext = '{"subject":"Welcome"}';

    expect(encryptor.encrypt(plaintext)).not.toBe(
      encryptor.encrypt(plaintext),
    );
  });

  it('rejects a payload whose authentication tag or ciphertext was tampered with', () => {
    const encryptor = createEncryptor();
    const encrypted = encryptor.encrypt('confidential payload');

    const encoded = encrypted.slice(3);
    const payload = Buffer.from(encoded, 'base64');

    payload[payload.length - 1] = payload[payload.length - 1]! ^ 1;

    const tampered = `v1:${payload.toString('base64')}`;

    expect(() => encryptor.decrypt(tampered)).toThrow(
      'Unable to decrypt outbound email payload',
    );
  });

  it('rejects unsupported payload versions', () => {
    const encryptor = createEncryptor();

    expect(() => encryptor.decrypt('v2:YWJj')).toThrow(
      'Unsupported encrypted outbound email payload format',
    );
  });

  it('rejects malformed or truncated ciphertext', () => {
    const encryptor = createEncryptor();

    expect(() => encryptor.decrypt('v1:abc')).toThrow(
      'Invalid encrypted outbound email payload',
    );
  });

  it('rejects empty plaintext', () => {
    const encryptor = createEncryptor();

    expect(() => encryptor.encrypt('')).toThrow(
      'Outbound email payload must not be empty',
    );
  });

  it('rejects a key that is not a canonical base64-encoded 32-byte value', () => {
    expect(() => createEncryptor('invalid-key')).toThrow(
      'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY',
    );
  });
});
