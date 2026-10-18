import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EmailTokenEncryptor } from '../../application/ports/email-token-encryptor.port.js';

@Injectable()
export class AesGcmEmailTokenEncryptor implements EmailTokenEncryptor {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encodedKey = configService.getOrThrow<string>(
      'EMAIL_TOKEN_ENCRYPTION_KEY',
    );

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new Error(
        'EMAIL_TOKEN_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key',
      );
    }

    this.key = key;
  }

  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error('Email token must not be empty');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]);

    return `v1:${payload.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith('v1:')) {
      throw new Error('Unsupported encrypted email token format');
    }

    const encodedPayload = ciphertext.slice(3);
    const payload = Buffer.from(encodedPayload, 'base64');

    if (payload.length <= 28 || payload.toString('base64') !== encodedPayload) {
      throw new Error('Invalid encrypted email token payload');
    }

    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);

      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Unable to decrypt email token payload');
    }
  }
}
