import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OutboundEmailProviderError } from '../../application/errors/outbound-email-provider.error.js';
import { OutboundEmailTemplateRegistry } from '../../application/templates/outbound-email-template.registry.js';
import { IdentityPasswordResetEmailTemplate } from '../../application/templates/identity-password-reset-email.template.js';
import type { OutboundEmailDeliveryStore } from '../../application/ports/outbound-email-delivery-store.port.js';
import type { OutboundEmailPayloadEncryptor } from '../../application/ports/outbound-email-payload-encryptor.port.js';
import type { OutboundEmailProvider } from '../../application/ports/outbound-email-provider.port.js';
import { OutboundEmailDeliveryHandler } from './outbound-email-delivery.worker.js';

const MESSAGE_ID = 'outbound-email-test-1';
const LEASE_TOKEN = 'worker-test:lease-1';

const VALID_PAYLOAD = {
  resetUrl:
    'https://frontend.example.com/reset-password?token=secure-token&email=user%40example.com',
};

const CLAIMED_DELIVERY = {
  messageId: MESSAGE_ID,
  lane: 'TRANSACTIONAL' as const,
  leaseToken: LEASE_TOKEN,
  leaseUntil: new Date('2026-10-21T12:01:00.000Z'),
  templateKey: 'identity.password-reset',
  payloadVersion: 1,
  encryptedPayload: 'encrypted-payload',
  validUntil: new Date('2026-10-21T12:15:00.000Z'),
};

function createJob(
  data: unknown = {
    outboundEmailMessageId: MESSAGE_ID,
  },
) {
  return {
    id: 'outbound-email-job-test-1',
    data,
  } as never;
}

function createHarness() {
  const deliveryStore = {
    claimForDelivery: vi.fn().mockResolvedValue(CLAIMED_DELIVERY),
    prepareForDelivery: vi.fn().mockResolvedValue('READY'),
    markAccepted: vi.fn().mockResolvedValue(true),
    scheduleRetry: vi.fn().mockResolvedValue(true),
    markDead: vi.fn().mockResolvedValue(true),
    markOutcomeUnknown: vi.fn().mockResolvedValue(true),
    recoverExpiredProcessingMessages: vi.fn().mockResolvedValue(0),
  };

  const payloadEncryptor = {
    encrypt: vi.fn(),
    decrypt: vi.fn().mockReturnValue(JSON.stringify(VALID_PAYLOAD)),
  };

  const provider = {
    send: vi.fn().mockResolvedValue({
      providerMessageId: 'smtp-message-123',
    }),
  };

  const logger = {
    setContext: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  const templateRegistry = new OutboundEmailTemplateRegistry([
    new IdentityPasswordResetEmailTemplate(),
  ]);

  const handler = new OutboundEmailDeliveryHandler(
    deliveryStore as unknown as OutboundEmailDeliveryStore,
    payloadEncryptor as unknown as OutboundEmailPayloadEncryptor,
    provider as unknown as OutboundEmailProvider,
    templateRegistry,
    logger as never,
  );

  return {
    handler,
    deliveryStore,
    payloadEncryptor,
    provider,
    logger,
  };
}

describe('OutboundEmailDeliveryHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims, prepares, sends and records an accepted email', async () => {
    const { handler, deliveryStore, payloadEncryptor, provider } =
      createHarness();

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.claimForDelivery).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      lane: 'TRANSACTIONAL',
      workerPrefix: 'outbound-email-transactional',
      leaseDurationMs: 60_000,
    });

    expect(payloadEncryptor.decrypt).toHaveBeenCalledWith('encrypted-payload');

    expect(deliveryStore.prepareForDelivery).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      leaseDurationMs: 60_000,
    });

    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset your Tarkhineh password',
      }),
    );

    expect(deliveryStore.markAccepted).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      providerMessageId: 'smtp-message-123',
    });
  });

  it('ignores a job with invalid data without claiming a message', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    await handler.deliver(createJob({}), 'TRANSACTIONAL');

    expect(deliveryStore.claimForDelivery).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('does nothing when another worker has already claimed or completed the message', async () => {
    const { handler, deliveryStore, payloadEncryptor, provider } =
      createHarness();

    deliveryStore.claimForDelivery.mockResolvedValue(null);

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(payloadEncryptor.decrypt).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('marks a message dead when its encrypted payload is missing', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    deliveryStore.claimForDelivery.mockResolvedValue({
      ...CLAIMED_DELIVERY,
      encryptedPayload: null,
    });

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.markDead).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      errorCode: 'PAYLOAD_MISSING',
    });

    expect(provider.send).not.toHaveBeenCalled();
  });

  it('marks a message dead when payload decryption fails', async () => {
    const { handler, deliveryStore, payloadEncryptor, provider } =
      createHarness();

    payloadEncryptor.decrypt.mockImplementation(() => {
      throw new Error('Sensitive decryption detail');
    });

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.markDead).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      errorCode: 'PAYLOAD_DECRYPTION_FAILED',
    });

    expect(provider.send).not.toHaveBeenCalled();
  });

  it('marks a message dead when the decrypted payload is not valid JSON', async () => {
    const { handler, deliveryStore, payloadEncryptor, provider } =
      createHarness();

    payloadEncryptor.decrypt.mockReturnValue('{invalid-json');

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.markDead).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      errorCode: 'PAYLOAD_INVALID',
    });

    expect(provider.send).not.toHaveBeenCalled();
  });

  it('does not call the provider if the lease is no longer valid for delivery', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    deliveryStore.prepareForDelivery.mockResolvedValue('LEASE_LOST');

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(provider.send).not.toHaveBeenCalled();
    expect(deliveryStore.markAccepted).not.toHaveBeenCalled();
  });

  it('does not call the provider when the message expires before delivery', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    deliveryStore.prepareForDelivery.mockResolvedValue('EXPIRED');

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(provider.send).not.toHaveBeenCalled();
    expect(deliveryStore.markAccepted).not.toHaveBeenCalled();
  });

  it('schedules a retry after a temporary provider rejection', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    provider.send.mockRejectedValue(
      new OutboundEmailProviderError('TEMPORARY_REJECTION'),
    );

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.scheduleRetry).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      retryDelayMs: 30_000,
      errorCode: 'PROVIDER_TEMPORARY_REJECTION',
    });

    expect(deliveryStore.markAccepted).not.toHaveBeenCalled();
  });

  it('schedules a retry when the provider is not ready', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    provider.send.mockRejectedValue(
      new OutboundEmailProviderError('NOT_READY'),
    );

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.scheduleRetry).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      retryDelayMs: 30_000,
      errorCode: 'PROVIDER_NOT_READY',
    });
  });

  it('marks a message dead after a permanent provider rejection', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    provider.send.mockRejectedValue(
      new OutboundEmailProviderError('PERMANENT_REJECTION'),
    );

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.markDead).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      errorCode: 'PROVIDER_PERMANENT_REJECTION',
    });

    expect(deliveryStore.scheduleRetry).not.toHaveBeenCalled();
  });

  it('records an unknown outcome instead of retrying an ambiguous provider result', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    provider.send.mockRejectedValue(
      new OutboundEmailProviderError('OUTCOME_UNKNOWN'),
    );

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.markOutcomeUnknown).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    });

    expect(deliveryStore.scheduleRetry).not.toHaveBeenCalled();
  });

  it('treats an unexpected provider exception as an unknown outcome', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    provider.send.mockRejectedValue(new Error('Internal transport details'));

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(deliveryStore.markOutcomeUnknown).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      leaseToken: LEASE_TOKEN,
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    });

    expect(deliveryStore.scheduleRetry).not.toHaveBeenCalled();
  });

  it('does not resend when acceptance cannot be recorded under the lease', async () => {
    const { handler, deliveryStore, provider, logger } = createHarness();

    deliveryStore.markAccepted.mockResolvedValue(false);

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(provider.send).toHaveBeenCalledOnce();
    expect(deliveryStore.markAccepted).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not send an email when its password reset challenge is ineligible', async () => {
    const { handler, deliveryStore, provider } = createHarness();

    deliveryStore.prepareForDelivery.mockResolvedValue('CANCELLED');

    await handler.deliver(createJob(), 'TRANSACTIONAL');

    expect(provider.send).not.toHaveBeenCalled();
    expect(deliveryStore.markAccepted).not.toHaveBeenCalled();
    expect(deliveryStore.scheduleRetry).not.toHaveBeenCalled();
  });
});
