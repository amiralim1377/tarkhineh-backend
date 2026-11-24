import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaTransactionContext } from '../../../../prisma/transaction/prisma-transaction-context.js';

import { OutboundEmailIdempotencyConflictError } from '../../application/errors/outbound-email-idempotency-conflict.error.js';

import type { CreateOutboundEmailMessageInput } from '../../application/ports/outbound-email-message-store.port.js';

import { PrismaOutboundEmailMessageStore } from './prisma-outbound-email-message.store.js';

// ============================================================
// MOCKS
// ============================================================

const queryRawMock = vi.fn();

const transactionClientMock = {
  $queryRaw: queryRawMock,
};

const transactionContext = new PrismaTransactionContext(
  transactionClientMock as unknown as Prisma.TransactionClient,
);

const EXISTING_MESSAGE_ID = 'existing-email-message-123';
const NEW_MESSAGE_ID = 'new-email-message-123';

const REQUEST_FINGERPRINT = 'a'.repeat(64);
const DIFFERENT_FINGERPRINT = 'b'.repeat(64);

const VALID_UNTIL = new Date('2026-12-01T12:00:00.000Z');

// ============================================================
// FIXTURES
// ============================================================

function createInput(
  overrides: Partial<CreateOutboundEmailMessageInput> = {},
): CreateOutboundEmailMessageInput {
  return {
    idempotencyKey: 'membership-invitation:invitation-123',
    requestFingerprint: REQUEST_FINGERPRINT,
    lane: 'TRANSACTIONAL',
    templateKey: 'organization.membership-invitation',
    payloadVersion: 1,
    encryptedPayload: 'encrypted-payload-123',
    validUntil: VALID_UNTIL,
    aggregateType: 'MembershipInvitation',
    aggregateId: 'invitation-123',
    ...overrides,
  };
}

function getSql(callIndex = 0): string {
  const call = queryRawMock.mock.calls[callIndex];

  if (!call) {
    throw new Error(`Expected query call at index ${callIndex}.`);
  }

  return (call[0] as TemplateStringsArray).join(' ');
}

function getParameters(callIndex = 0): unknown[] {
  const call = queryRawMock.mock.calls[callIndex];

  if (!call) {
    throw new Error(`Expected query call at index ${callIndex}.`);
  }

  return call.slice(1) as unknown[];
}

// ============================================================
// TEST SUITE
// ============================================================

describe('PrismaOutboundEmailMessageStore', () => {
  let sut: PrismaOutboundEmailMessageStore;

  beforeEach(() => {
    vi.clearAllMocks();

    sut = new PrismaOutboundEmailMessageStore();
  });

  // ==========================================================
  // CREATE MESSAGE
  // ==========================================================

  describe('createOrGet - new message', () => {
    it('should create a new outbound email message', async () => {
      queryRawMock.mockResolvedValueOnce([
        {
          id: NEW_MESSAGE_ID,
        },
      ]);

      const result = await sut.createOrGet(createInput(), transactionContext);

      expect(result).toEqual({
        messageId: NEW_MESSAGE_ID,
        created: true,
      });

      expect(queryRawMock).toHaveBeenCalledOnce();
    });

    it('should insert the message into OutboundEmailMessage', async () => {
      queryRawMock.mockResolvedValueOnce([
        {
          id: NEW_MESSAGE_ID,
        },
      ]);

      await sut.createOrGet(createInput(), transactionContext);

      const sql = getSql();

      expect(sql).toContain('INSERT INTO public."OutboundEmailMessage"');

      expect(sql).toContain('"requestFingerprint"');

      expect(sql).toContain('ON CONFLICT ("idempotencyKey") DO NOTHING');

      expect(sql).toContain('RETURNING "id"');
    });

    it('should persist all message properties', async () => {
      const input = createInput();

      queryRawMock.mockResolvedValueOnce([
        {
          id: NEW_MESSAGE_ID,
        },
      ]);

      await sut.createOrGet(input, transactionContext);

      const parameters = getParameters();

      expect(parameters).toContain(input.idempotencyKey);
      expect(parameters).toContain(input.requestFingerprint);
      expect(parameters).toContain(input.lane);
      expect(parameters).toContain(input.templateKey);
      expect(parameters).toContain(input.payloadVersion);
      expect(parameters).toContain(input.encryptedPayload);
      expect(parameters).toContain(input.validUntil);
      expect(parameters).toContain(input.aggregateType);
      expect(parameters).toContain(input.aggregateId);
    });

    it('should generate a UUID using UniqueId', async () => {
      queryRawMock.mockResolvedValueOnce([
        {
          id: NEW_MESSAGE_ID,
        },
      ]);

      await sut.createOrGet(createInput(), transactionContext);

      const [generatedId] = getParameters();

      expect(generatedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should create messages with PENDING status', async () => {
      queryRawMock.mockResolvedValueOnce([
        {
          id: NEW_MESSAGE_ID,
        },
      ]);

      await sut.createOrGet(createInput(), transactionContext);

      expect(getSql()).toContain('\'PENDING\'::"OutboundEmailStatus"');
    });

    it('should use the supplied transaction context without opening another transaction', async () => {
      queryRawMock.mockResolvedValueOnce([
        {
          id: NEW_MESSAGE_ID,
        },
      ]);

      await sut.createOrGet(createInput(), transactionContext);

      expect(queryRawMock).toHaveBeenCalledOnce();

      // The Store receives only the transaction-bound Prisma client.
      expect(transactionClientMock).not.toHaveProperty('$transaction');
    });
  });

  // ==========================================================
  // IDEMPOTENCY
  // ==========================================================

  describe('createOrGet - idempotency', () => {
    it('should return the existing message when the fingerprint matches', async () => {
      queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: EXISTING_MESSAGE_ID,
          requestFingerprint: REQUEST_FINGERPRINT,
        },
      ]);

      const result = await sut.createOrGet(createInput(), transactionContext);

      expect(result).toEqual({
        messageId: EXISTING_MESSAGE_ID,
        created: false,
      });

      expect(queryRawMock).toHaveBeenCalledTimes(2);
    });

    it('should look up the existing message using the idempotency key', async () => {
      const input = createInput();

      queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: EXISTING_MESSAGE_ID,
          requestFingerprint: REQUEST_FINGERPRINT,
        },
      ]);

      await sut.createOrGet(input, transactionContext);

      expect(getSql(1)).toContain('FROM public."OutboundEmailMessage"');

      expect(getSql(1)).toContain('WHERE "idempotencyKey"');

      expect(getParameters(1)).toContain(input.idempotencyKey);
    });

    it('should throw a conflict error when the fingerprint is different', async () => {
      queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: EXISTING_MESSAGE_ID,
          requestFingerprint: DIFFERENT_FINGERPRINT,
        },
      ]);

      await expect(
        sut.createOrGet(createInput(), transactionContext),
      ).rejects.toBeInstanceOf(OutboundEmailIdempotencyConflictError);

      expect(queryRawMock).toHaveBeenCalledTimes(2);
    });

    it('should throw a conflict error when the existing fingerprint is null', async () => {
      queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: EXISTING_MESSAGE_ID,
          requestFingerprint: null,
        },
      ]);

      await expect(
        sut.createOrGet(createInput(), transactionContext),
      ).rejects.toBeInstanceOf(OutboundEmailIdempotencyConflictError);
    });

    it('should not update an existing message when its idempotency key is reused', async () => {
      queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: EXISTING_MESSAGE_ID,
          requestFingerprint: REQUEST_FINGERPRINT,
        },
      ]);

      await sut.createOrGet(createInput(), transactionContext);

      expect(getSql(0)).not.toMatch(/\bUPDATE\b/i);
      expect(getSql(1)).not.toMatch(/\bUPDATE\b/i);
    });

    it('should throw an unexpected error when the conflicting message cannot be found', async () => {
      queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await expect(
        sut.createOrGet(createInput(), transactionContext),
      ).rejects.toThrow(
        'Unable to resolve outbound email idempotency conflict.',
      );
    });
  });

  // ==========================================================
  // TRANSACTION CONTEXT
  // ==========================================================

  describe('transaction context validation', () => {
    it('should reject a context that is not a PrismaTransactionContext', async () => {
      await expect(sut.createOrGet(createInput(), {} as never)).rejects.toThrow(
        'PrismaOutboundEmailMessageStore requires a PrismaTransactionContext.',
      );

      expect(queryRawMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // INPUT VALIDATION
  // ==========================================================

  describe('input validation', () => {
    it('should reject a null input', async () => {
      await expect(
        sut.createOrGet(
          null as unknown as CreateOutboundEmailMessageInput,
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an empty idempotency key', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            idempotencyKey: '   ',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an idempotency key with surrounding whitespace', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            idempotencyKey: ' invitation-123 ',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an invalid fingerprint', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            requestFingerprint: 'invalid-fingerprint',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an uppercase fingerprint', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            requestFingerprint: 'A'.repeat(64),
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an invalid lane', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            lane: 'INVALID' as CreateOutboundEmailMessageInput['lane'],
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an empty template key', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            templateKey: '   ',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an invalid payload version', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            payloadVersion: 0,
          }),
          transactionContext,
        ),
      ).rejects.toThrow(RangeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an empty encrypted payload', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            encryptedPayload: '',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an invalid expiration date', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            validUntil: new Date(Number.NaN),
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an incomplete aggregate reference', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            aggregateType: 'MembershipInvitation',
            aggregateId: null,
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('should reject an empty aggregate type', async () => {
      await expect(
        sut.createOrGet(
          createInput({
            aggregateType: '   ',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(queryRawMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // DATABASE ERROR HANDLING
  // ==========================================================

  describe('database error handling', () => {
    it('should propagate insert errors', async () => {
      const databaseError = new Error('Database insert failed.');

      queryRawMock.mockRejectedValueOnce(databaseError);

      await expect(
        sut.createOrGet(createInput(), transactionContext),
      ).rejects.toBe(databaseError);
    });

    it('should propagate lookup errors', async () => {
      const databaseError = new Error('Database lookup failed.');

      queryRawMock
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(databaseError);

      await expect(
        sut.createOrGet(createInput(), transactionContext),
      ).rejects.toBe(databaseError);
    });
  });
});
