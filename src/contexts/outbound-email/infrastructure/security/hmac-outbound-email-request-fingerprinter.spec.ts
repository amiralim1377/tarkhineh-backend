import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { HmacOutboundEmailRequestFingerprinter } from './hmac-outbound-email-request-fingerprinter.js';

import type { OutboundEmailRequestFingerprintInput } from '../../application/ports/outbound-email-request-fingerprinter.port.js';

const TEST_KEY = Buffer.alloc(32, 0x11).toString('base64');
const ANOTHER_TEST_KEY = Buffer.alloc(32, 0x22).toString('base64');

const VALID_UNTIL = new Date('2026-12-01T12:00:00.000Z');

function createConfigService(encodedKey: string = TEST_KEY): ConfigService {
  return {
    getOrThrow: vi.fn((key: string) => {
      if (key !== 'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY') {
        throw new Error(`Unexpected configuration key: ${key}`);
      }

      return encodedKey;
    }),
  } as unknown as ConfigService;
}

function createSut(encodedKey: string = TEST_KEY) {
  return new HmacOutboundEmailRequestFingerprinter(
    createConfigService(encodedKey),
  );
}

function createInput(
  overrides: Partial<OutboundEmailRequestFingerprintInput> = {},
): OutboundEmailRequestFingerprintInput {
  return {
    lane: 'TRANSACTIONAL',
    templateKey: 'organization.membership-invitation',
    payloadVersion: 1,
    payload: {
      email: 'employee@example.com',
      token: 'raw-token-123',
    },
    validUntil: VALID_UNTIL,
    aggregateType: 'MembershipInvitation',
    aggregateId: 'invitation-123',
    ...overrides,
  };
}

describe('HmacOutboundEmailRequestFingerprinter', () => {
  describe('construction', () => {
    it('should initialize with a valid 32-byte base64 key', () => {
      expect(() => createSut()).not.toThrow();
    });

    it('should reject an invalid base64 key', () => {
      expect(() => createSut('not-a-valid-key')).toThrow(
        'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY must be a valid base64-encoded 32-byte key.',
      );
    });

    it('should reject a key with an incorrect length', () => {
      const shortKey = Buffer.alloc(16).toString('base64');

      expect(() => createSut(shortKey)).toThrow(
        'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY must be a valid base64-encoded 32-byte key.',
      );
    });

    it('should reject non-canonical base64 encoding', () => {
      const nonCanonicalKey = `${TEST_KEY}!`;

      expect(() => createSut(nonCanonicalKey)).toThrow(
        'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY must be a valid base64-encoded 32-byte key.',
      );
    });

    it('should reject an unpadded base64 key', () => {
      const unpaddedKey = TEST_KEY.replace(/=+$/, '');

      expect(() => createSut(unpaddedKey)).toThrow(
        'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY must be a valid base64-encoded 32-byte key.',
      );
    });

    it('should propagate a missing configuration error', () => {
      const configService = {
        getOrThrow: vi.fn(() => {
          throw new Error('Configuration value is missing.');
        }),
      } as unknown as ConfigService;

      expect(
        () => new HmacOutboundEmailRequestFingerprinter(configService),
      ).toThrow('Configuration value is missing.');
    });
  });

  describe('fingerprint generation', () => {
    it('should generate a 64-character lowercase hexadecimal fingerprint', () => {
      const sut = createSut();

      const fingerprint = sut.fingerprint(createInput());

      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate the same fingerprint for identical requests', () => {
      const sut = createSut();

      const input = createInput();

      const firstFingerprint = sut.fingerprint(input);
      const secondFingerprint = sut.fingerprint(input);

      expect(firstFingerprint).toBe(secondFingerprint);
    });

    it('should generate the same fingerprint regardless of object property order', () => {
      const sut = createSut();

      const firstInput = createInput({
        payload: {
          email: 'employee@example.com',
          name: 'Employee',
          metadata: {
            department: 'Finance',
            organization: 'Tarkhineh',
          },
        },
      });

      const secondInput = createInput({
        payload: {
          metadata: {
            organization: 'Tarkhineh',
            department: 'Finance',
          },
          name: 'Employee',
          email: 'employee@example.com',
        },
      });

      expect(sut.fingerprint(firstInput)).toBe(sut.fingerprint(secondInput));
    });

    it('should preserve array element order when calculating the fingerprint', () => {
      const sut = createSut();

      const firstFingerprint = sut.fingerprint(
        createInput({
          payload: {
            permissions: ['READ', 'WRITE'],
          },
        }),
      );

      const secondFingerprint = sut.fingerprint(
        createInput({
          payload: {
            permissions: ['WRITE', 'READ'],
          },
        }),
      );

      expect(firstFingerprint).not.toBe(secondFingerprint);
    });

    it('should generate the same fingerprint for equivalent Date values', () => {
      const sut = createSut();

      const firstFingerprint = sut.fingerprint(
        createInput({
          validUntil: new Date('2026-12-01T12:00:00.000Z'),
        }),
      );

      const secondFingerprint = sut.fingerprint(
        createInput({
          validUntil: new Date('2026-12-01T15:30:00.000+03:30'),
        }),
      );

      expect(firstFingerprint).toBe(secondFingerprint);
    });

    it('should generate different fingerprints when the HMAC key changes', () => {
      const firstFingerprinter = createSut(TEST_KEY);
      const secondFingerprinter = createSut(ANOTHER_TEST_KEY);

      const input = createInput();

      expect(firstFingerprinter.fingerprint(input)).not.toBe(
        secondFingerprinter.fingerprint(input),
      );
    });

    it('should produce the expected HMAC-SHA256 digest', () => {
      const sut = createSut();

      const input = createInput();

      const canonicalRequest = JSON.stringify({
        aggregateId: input.aggregateId,
        aggregateType: input.aggregateType,
        fingerprintVersion: 1,
        lane: input.lane,
        payload: {
          email: 'employee@example.com',
          token: 'raw-token-123',
        },
        payloadVersion: input.payloadVersion,
        templateKey: input.templateKey,
        validUntil: VALID_UNTIL.toISOString(),
      });

      const expectedFingerprint = createHmac(
        'sha256',
        Buffer.from(TEST_KEY, 'base64'),
      )
        .update(canonicalRequest, 'utf8')
        .digest('hex');

      expect(sut.fingerprint(input)).toBe(expectedFingerprint);
    });
  });

  describe('request change detection', () => {
    it.each([
      {
        name: 'lane',
        override: { lane: 'BULK' as const },
      },
      {
        name: 'template key',
        override: { templateKey: 'organization.membership-welcome' },
      },
      {
        name: 'payload version',
        override: { payloadVersion: 2 },
      },
      {
        name: 'payload content',
        override: {
          payload: {
            email: 'another-employee@example.com',
            token: 'raw-token-123',
          },
        },
      },
      {
        name: 'expiration date',
        override: {
          validUntil: new Date('2026-12-02T12:00:00.000Z'),
        },
      },
      {
        name: 'aggregate type',
        override: { aggregateType: 'OrganizationMembership' },
      },
      {
        name: 'aggregate ID',
        override: { aggregateId: 'invitation-456' },
      },
      {
        name: 'null expiration versus a concrete expiration',
        override: { validUntil: null },
      },
    ])(
      'should generate a different fingerprint when $name changes',
      ({ override }) => {
        const sut = createSut();

        const originalFingerprint = sut.fingerprint(createInput());
        const changedFingerprint = sut.fingerprint(createInput(override));

        expect(changedFingerprint).not.toBe(originalFingerprint);
      },
    );
  });

  describe('input validation', () => {
    it('should reject an invalid expiration date', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            validUntil: new Date(Number.NaN),
          }),
        ),
      ).toThrow('Fingerprint expiration date is invalid.');
    });

    it('should reject a non-Date expiration value', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            validUntil: 'invalid-date' as unknown as Date,
          }),
        ),
      ).toThrow('Fingerprint expiration date is invalid.');
    });

    it('should accept a null expiration date', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            validUntil: null,
          }),
        ),
      ).not.toThrow();
    });

    it('should reject circular payload references', () => {
      const sut = createSut();

      const cyclicPayload: Record<string, unknown> = {};
      cyclicPayload.self = cyclicPayload;

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: cyclicPayload,
          }),
        ),
      ).toThrow('Fingerprint input contains a circular reference.');
    });

    it('should reject undefined payload values', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              email: 'employee@example.com',
              optionalValue: undefined,
            },
          }),
        ),
      ).toThrow(TypeError);
    });

    it('should reject BigInt payload values', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              value: BigInt(123),
            },
          }),
        ),
      ).toThrow(TypeError);
    });

    it('should reject non-finite payload numbers', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              value: Number.NaN,
            },
          }),
        ),
      ).toThrow('Fingerprint input contains an invalid number.');
    });

    it('should reject infinite payload numbers', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              value: Number.POSITIVE_INFINITY,
            },
          }),
        ),
      ).toThrow('Fingerprint input contains an invalid number.');
    });

    it('should reject Date objects inside the payload', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          }),
        ),
      ).toThrow('Fingerprint input must contain plain JSON objects.');
    });

    it('should reject class instances inside the payload', () => {
      const sut = createSut();

      class CustomPayload {
        readonly value = 'test';
      }

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              nested: new CustomPayload(),
            },
          }),
        ),
      ).toThrow('Fingerprint input must contain plain JSON objects.');
    });

    it('should reject symbol properties', () => {
      const sut = createSut();

      const payload: Record<string, unknown> = {
        email: 'employee@example.com',
      };

      Object.defineProperty(payload, Symbol('secret'), {
        value: 'hidden',
      });

      expect(() =>
        sut.fingerprint(
          createInput({
            payload,
          }),
        ),
      ).toThrow('Fingerprint input contains symbol properties.');
    });

    it('should reject accessor properties', () => {
      const sut = createSut();

      const payload: Record<string, unknown> = {};

      Object.defineProperty(payload, 'email', {
        enumerable: true,
        get: () => 'employee@example.com',
      });

      expect(() =>
        sut.fingerprint(
          createInput({
            payload,
          }),
        ),
      ).toThrow('Fingerprint input must not contain accessor properties.');
    });

    it('should reject sparse arrays', () => {
      const sut = createSut();

      const sparseArray: unknown[] = [];
      sparseArray.length = 2;
      sparseArray[1] = 'value';

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              values: sparseArray,
            },
          }),
        ),
      ).toThrow('Fingerprint input contains an invalid array element.');
    });

    it('should reject function values', () => {
      const sut = createSut();

      expect(() =>
        sut.fingerprint(
          createInput({
            payload: {
              callback: () => 'test',
            },
          }),
        ),
      ).toThrow(TypeError);
    });
  });
});
