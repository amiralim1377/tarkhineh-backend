import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

import type {
  OutboundEmailRequestFingerprintInput,
  OutboundEmailRequestFingerprinter,
} from '../../application/ports/outbound-email-request-fingerprinter.port.js';

const KEY_LENGTH_BYTES = 32;

function canonicalizeJson(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet<object>(),
): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Fingerprint input contains an invalid number.');
    }

    return JSON.stringify(value);
  }

  if (typeof value !== 'object') {
    throw new TypeError('Fingerprint input is not valid JSON data.');
  }

  if (ancestors.has(value)) {
    throw new TypeError('Fingerprint input contains a circular reference.');
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const items: string[] = [];

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );

        if (
          !descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ) {
          throw new TypeError(
            'Fingerprint input contains an invalid array element.',
          );
        }

        items.push(canonicalizeJson(descriptor.value, ancestors));
      }

      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError('Fingerprint input contains symbol properties.');
      }

      return `[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Fingerprint input must contain plain JSON objects.');
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('Fingerprint input contains symbol properties.');
    }

    const keys = Object.keys(value).sort();

    const properties = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        throw new TypeError(
          'Fingerprint input must not contain accessor properties.',
        );
      }

      return `${JSON.stringify(key)}:${canonicalizeJson(
        descriptor.value,
        ancestors,
      )}`;
    });

    return `{${properties.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

@Injectable()
export class HmacOutboundEmailRequestFingerprinter implements OutboundEmailRequestFingerprinter {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encodedKey = configService.getOrThrow<string>(
      'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY',
    );

    const key = Buffer.from(encodedKey, 'base64');

    if (
      key.length !== KEY_LENGTH_BYTES ||
      key.toString('base64') !== encodedKey
    ) {
      throw new Error(
        'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY must be a valid base64-encoded 32-byte key.',
      );
    }

    this.key = key;
  }

  fingerprint(input: OutboundEmailRequestFingerprintInput): string {
    if (
      !(input.validUntil === null) &&
      (!(input.validUntil instanceof Date) ||
        !Number.isFinite(input.validUntil.getTime()))
    ) {
      throw new TypeError('Fingerprint expiration date is invalid.');
    }

    const canonicalRequest = canonicalizeJson({
      fingerprintVersion: 1,
      lane: input.lane,
      templateKey: input.templateKey,
      payloadVersion: input.payloadVersion,
      payload: input.payload,
      validUntil: input.validUntil?.toISOString() ?? null,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
    });

    return createHmac('sha256', this.key)
      .update(canonicalRequest, 'utf8')
      .digest('hex');
  }
}
