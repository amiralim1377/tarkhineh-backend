import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OutboundEmailEnqueueService } from './outbound-email-enqueue.service.js';

import {
  TRANSACTION_CONTEXT,
  type TransactionContext,
} from '../../../../shared/application/ports/transaction-runner.port.js';

import type { EnqueueOutboundEmailInput } from '../../contracts/outbound-email-enqueue.contract.js';

import type { OutboundEmailPayloadEncryptor } from '../ports/outbound-email-payload-encryptor.port.js';

import type { OutboundEmailMessageStore } from '../ports/outbound-email-message-store.port.js';

const transactionContext: TransactionContext = {
  [TRANSACTION_CONTEXT]: true,
};

const payloadEncryptorMock = {
  encrypt: vi.fn<(plaintext: string) => string>(),
  decrypt: vi.fn<(ciphertext: string) => string>(),
};

const messageStoreMock = {
  createOrGet: vi.fn<OutboundEmailMessageStore['createOrGet']>(),
};

function createInput(
  overrides: Partial<EnqueueOutboundEmailInput> = {},
): EnqueueOutboundEmailInput {
  return {
    idempotencyKey: 'membership-invitation:invitation-123',
    lane: 'TRANSACTIONAL',
    templateKey: 'organization.membership-invitation',
    payloadVersion: 1,
    payload: {
      email: 'employee@example.com',
      token: 'raw-token-123',
    },
    validUntil: new Date(Date.now() + 60_000),
    aggregateType: 'MembershipInvitation',
    aggregateId: 'invitation-123',
    ...overrides,
  };
}

describe('OutboundEmailEnqueueService', () => {
  let sut: OutboundEmailEnqueueService;

  beforeEach(() => {
    vi.clearAllMocks();

    payloadEncryptorMock.encrypt.mockReturnValue('encrypted-payload-123');

    messageStoreMock.createOrGet.mockResolvedValue({
      messageId: 'email-message-123',
      created: true,
    });

    sut = new OutboundEmailEnqueueService(
      payloadEncryptorMock as OutboundEmailPayloadEncryptor,
      messageStoreMock as OutboundEmailMessageStore,
    );
  });

  describe('enqueue', () => {
    it('should serialize and encrypt the payload', async () => {
      const input = createInput();

      await sut.enqueue(input, transactionContext);

      expect(payloadEncryptorMock.encrypt).toHaveBeenCalledOnce();

      expect(payloadEncryptorMock.encrypt).toHaveBeenCalledWith(
        JSON.stringify(input.payload),
      );
    });

    it('should store the encrypted payload instead of the plaintext payload', async () => {
      const input = createInput();

      await sut.enqueue(input, transactionContext);

      const [storedInput] = messageStoreMock.createOrGet.mock.calls[0]!;

      expect(storedInput.encryptedPayload).toBe('encrypted-payload-123');

      expect(storedInput).not.toHaveProperty('payload');
    });

    it('should pass all message properties to the message store', async () => {
      const input = createInput();

      await sut.enqueue(input, transactionContext);

      expect(messageStoreMock.createOrGet).toHaveBeenCalledWith(
        {
          idempotencyKey: input.idempotencyKey,
          lane: input.lane,
          templateKey: input.templateKey,
          payloadVersion: input.payloadVersion,
          encryptedPayload: 'encrypted-payload-123',
          validUntil: input.validUntil,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
        },
        transactionContext,
      );
    });

    it('should normalize optional properties to null', async () => {
      const input = createInput({
        validUntil: undefined,
        aggregateType: undefined,
        aggregateId: undefined,
      });

      await sut.enqueue(input, transactionContext);

      expect(messageStoreMock.createOrGet).toHaveBeenCalledWith(
        expect.objectContaining({
          validUntil: null,
          aggregateType: null,
          aggregateId: null,
        }),
        transactionContext,
      );
    });

    it('should return the message store result', async () => {
      const expectedResult = {
        messageId: 'email-message-123',
        created: true,
      };

      messageStoreMock.createOrGet.mockResolvedValue(expectedResult);

      const result = await sut.enqueue(createInput(), transactionContext);

      expect(result).toEqual(expectedResult);
    });

    it('should normalize the idempotency key', async () => {
      await sut.enqueue(
        createInput({
          idempotencyKey: '  invitation:123  ',
        }),
        transactionContext,
      );

      expect(messageStoreMock.createOrGet).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'invitation:123',
        }),
        transactionContext,
      );
    });

    it('should propagate payload encryption errors', async () => {
      const encryptionError = new Error('Encryption failed.');

      payloadEncryptorMock.encrypt.mockImplementation(() => {
        throw encryptionError;
      });

      await expect(sut.enqueue(createInput(), transactionContext)).rejects.toBe(
        encryptionError,
      );

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an empty encrypted payload', async () => {
      payloadEncryptorMock.encrypt.mockReturnValue('');

      await expect(
        sut.enqueue(createInput(), transactionContext),
      ).rejects.toThrow('Outbound email payload encryption failed.');

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should propagate message store errors', async () => {
      const storeError = new Error('Database operation failed.');

      messageStoreMock.createOrGet.mockRejectedValue(storeError);

      await expect(sut.enqueue(createInput(), transactionContext)).rejects.toBe(
        storeError,
      );
    });
  });

  describe('input validation', () => {
    it('should reject an invalid transaction context', async () => {
      await expect(
        sut.enqueue(createInput(), {} as TransactionContext),
      ).rejects.toThrow(TypeError);

      expect(payloadEncryptorMock.encrypt).not.toHaveBeenCalled();
      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an empty idempotency key', async () => {
      await expect(
        sut.enqueue(createInput({ idempotencyKey: '   ' }), transactionContext),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an invalid lane', async () => {
      await expect(
        sut.enqueue(
          createInput({
            lane: 'INVALID' as EnqueueOutboundEmailInput['lane'],
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an invalid template key', async () => {
      await expect(
        sut.enqueue(
          createInput({
            templateKey: 'Invalid Template Key',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an invalid payload version', async () => {
      await expect(
        sut.enqueue(
          createInput({
            payloadVersion: 0,
          }),
          transactionContext,
        ),
      ).rejects.toThrow(RangeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject a non-object payload', async () => {
      await expect(
        sut.enqueue(
          createInput({
            payload: null as unknown as Readonly<Record<string, unknown>>,
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an array payload', async () => {
      await expect(
        sut.enqueue(
          createInput({
            payload: [] as unknown as Readonly<Record<string, unknown>>,
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject a non-serializable payload', async () => {
      const cyclicPayload: Record<string, unknown> = {};
      cyclicPayload.self = cyclicPayload;

      await expect(
        sut.enqueue(
          createInput({
            payload: cyclicPayload,
          }),
          transactionContext,
        ),
      ).rejects.toThrow('Outbound email payload must be JSON serializable.');

      expect(payloadEncryptorMock.encrypt).not.toHaveBeenCalled();
      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an invalid expiration date', async () => {
      await expect(
        sut.enqueue(
          createInput({
            validUntil: new Date(Number.NaN),
          }),
          transactionContext,
        ),
      ).rejects.toThrow(RangeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an expiration date in the past', async () => {
      await expect(
        sut.enqueue(
          createInput({
            validUntil: new Date(Date.now() - 60_000),
          }),
          transactionContext,
        ),
      ).rejects.toThrow(RangeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an incomplete aggregate reference', async () => {
      await expect(
        sut.enqueue(
          createInput({
            aggregateType: 'MembershipInvitation',
            aggregateId: null,
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });

    it('should reject an empty aggregate type', async () => {
      await expect(
        sut.enqueue(
          createInput({
            aggregateType: '   ',
          }),
          transactionContext,
        ),
      ).rejects.toThrow(TypeError);

      expect(messageStoreMock.createOrGet).not.toHaveBeenCalled();
    });
  });
});
