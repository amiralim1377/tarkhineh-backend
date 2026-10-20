import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

import type { OutboundEmailPayloadEncryptor } from '../../application/ports/outbound-email-payload-encryptor.port.js';

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const FORMAT_PREFIX = 'v1:';

@Injectable()
export class AesGcmOutboundEmailPayloadEncryptor
  implements OutboundEmailPayloadEncryptor
{
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encodedKey = configService.getOrThrow<string>(
      'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY',
    );

    const key = Buffer.from(encodedKey, 'base64');

    if (
      key.length !== KEY_LENGTH_BYTES ||
      key.toString('base64') !== encodedKey
    ) {
      throw new Error(
        'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key',
      );
    }

    this.key = key;
  }

  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error('Outbound email payload must not be empty');
    }

    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]);

    return `${FORMAT_PREFIX}${payload.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith(FORMAT_PREFIX)) {
      throw new Error(
        'Unsupported encrypted outbound email payload format',
      );
    }

    const encodedPayload = ciphertext.slice(FORMAT_PREFIX.length);
    const payload = Buffer.from(encodedPayload, 'base64');

    if (
      !encodedPayload ||
      payload.length <= IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES ||
      payload.toString('base64') !== encodedPayload
    ) {
      throw new Error('Invalid encrypted outbound email payload');
    }

    const iv = payload.subarray(0, IV_LENGTH_BYTES);
    const authTag = payload.subarray(
      IV_LENGTH_BYTES,
      IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
    );
    const encrypted = payload.subarray(
      IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
    );

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        iv,
      );

      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Never expose cryptographic internals or payload contents.
      throw new Error('Unable to decrypt outbound email payload');
    }
  }
}
