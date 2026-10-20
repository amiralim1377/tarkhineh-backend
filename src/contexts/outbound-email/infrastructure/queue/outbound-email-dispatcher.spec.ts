import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

import type {
  OutboundEmailDispatchLease,
  OutboundEmailDispatchStore,
} from '../../application/ports/outbound-email-dispatch-store.port.js';
import { OutboundEmailDispatcher } from './outbound-email-dispatcher.js';

function createLease(
  messageId: string,
  lane: 'TRANSACTIONAL' | 'BULK',
): OutboundEmailDispatchLease {
  return {
    messageId,
    lane,
    leaseToken: `test-owner-${messageId}`,
    leaseUntil: new Date(Date.now() + 60_000),
  };
}

function createHarness() {
  const store = {
    claimBatch: vi.fn().mockResolvedValue([]),
    markQueued: vi.fn().mockResolvedValue(true),
    scheduleRetry: vi.fn().mockResolvedValue(true),
  } as unknown as OutboundEmailDispatchStore;

  const transactionalQueue = {
    add: vi.fn().mockResolvedValue({ id: 'transactional-job' }),
  } as unknown as Queue;

  const bulkQueue = {
    add: vi.fn().mockResolvedValue({ id: 'bulk-job' }),
  } as unknown as Queue;

  const logger = {
    setContext: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLogger;

  const dispatcher = new OutboundEmailDispatcher(
    store,
    transactionalQueue,
    bulkQueue,
    logger,
  );

  return {
    store,
    transactionalQueue,
    bulkQueue,
    logger,
    dispatcher,
  };
}

describe('OutboundEmailDispatcher', () => {
  it('claims and enqueues each lane to its own queue with stable job IDs and cleanup options', async () => {
    const { store, transactionalQueue, bulkQueue, dispatcher } =
      createHarness();

    const transactionalLease = createLease(
      'message-transactional',
      'TRANSACTIONAL',
    );
    const bulkLease = createLease('message-bulk', 'BULK');

    vi.mocked(store.claimBatch)
      .mockResolvedValueOnce([transactionalLease])
      .mockResolvedValueOnce([bulkLease]);

    await dispatcher.dispatchAvailableMessages();

    expect(store.claimBatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        lane: 'TRANSACTIONAL',
        batchSize: 50,
        leaseDurationMs: 60_000,
        ownerPrefix: expect.stringMatching(/^outbound-email-dispatcher-/),
      }),
    );

    expect(store.claimBatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        lane: 'BULK',
        batchSize: 50,
        leaseDurationMs: 60_000,
        ownerPrefix: expect.stringMatching(/^outbound-email-dispatcher-/),
      }),
    );

    expect(transactionalQueue.add).toHaveBeenCalledOnce();
    expect(transactionalQueue.add).toHaveBeenCalledWith(
      'deliver-outbound-email',
      {
        outboundEmailMessageId: 'message-transactional',
      },
      {
        jobId: 'outbound-email-message-transactional',
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    expect(bulkQueue.add).toHaveBeenCalledOnce();
    expect(bulkQueue.add).toHaveBeenCalledWith(
      'deliver-outbound-email',
      {
        outboundEmailMessageId: 'message-bulk',
      },
      {
        jobId: 'outbound-email-message-bulk',
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    expect(store.markQueued).toHaveBeenCalledTimes(2);
    expect(store.markQueued).toHaveBeenNthCalledWith(1, {
      messageId: transactionalLease.messageId,
      leaseToken: transactionalLease.leaseToken,
    });
    expect(store.markQueued).toHaveBeenNthCalledWith(2, {
      messageId: bulkLease.messageId,
      leaseToken: bulkLease.leaseToken,
    });

    expect(store.scheduleRetry).not.toHaveBeenCalled();
  });

  it('schedules a durable retry when queue insertion fails', async () => {
    const { store, transactionalQueue, dispatcher } = createHarness();
    const lease = createLease('message-retry', 'TRANSACTIONAL');

    vi.mocked(store.claimBatch).mockResolvedValueOnce([lease]);
    vi.mocked(transactionalQueue.add).mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );

    await dispatcher.dispatchAvailableMessages();

    expect(store.scheduleRetry).toHaveBeenCalledOnce();
    expect(store.scheduleRetry).toHaveBeenCalledWith({
      messageId: lease.messageId,
      leaseToken: lease.leaseToken,
      retryDelayMs: 5_000,
      errorCode: 'QUEUE_ENQUEUE_FAILED',
    });

    expect(store.markQueued).not.toHaveBeenCalled();
  });

  it('does not schedule a retry when lease ownership has already changed', async () => {
    const { store, logger, dispatcher } = createHarness();
    const lease = createLease('message-stale-lease', 'TRANSACTIONAL');

    vi.mocked(store.claimBatch).mockResolvedValueOnce([lease]);
    vi.mocked(store.markQueued).mockResolvedValueOnce(false);

    await dispatcher.dispatchAvailableMessages();

    expect(store.scheduleRetry).not.toHaveBeenCalled();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: lease.messageId,
        lane: lease.lane,
      }),
      expect.stringContaining('lease is no longer current'),
    );
  });

  it('continues processing the other lane when one lane claim fails', async () => {
    const { store, bulkQueue, dispatcher } = createHarness();

    const bulkLease = createLease('bulk-after-claim-error', 'BULK');

    vi.mocked(store.claimBatch)
      .mockRejectedValueOnce(new Error('PostgreSQL unavailable'))
      .mockResolvedValueOnce([bulkLease]);

    await dispatcher.dispatchAvailableMessages();

    expect(bulkQueue.add).toHaveBeenCalledOnce();
    expect(bulkQueue.add).toHaveBeenCalledWith(
      'deliver-outbound-email',
      {
        outboundEmailMessageId: bulkLease.messageId,
      },
      expect.objectContaining({
        jobId: 'outbound-email-bulk-after-claim-error',
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );

    expect(store.markQueued).toHaveBeenCalledWith({
      messageId: bulkLease.messageId,
      leaseToken: bulkLease.leaseToken,
    });
  });

  it('leaves the lease for recovery when queue-state persistence fails', async () => {
    const { store, logger, dispatcher } = createHarness();
    const lease = createLease('message-state-error', 'TRANSACTIONAL');

    vi.mocked(store.claimBatch).mockResolvedValueOnce([lease]);
    vi.mocked(store.markQueued).mockRejectedValueOnce(
      new Error('PostgreSQL unavailable'),
    );

    await dispatcher.dispatchAvailableMessages();

    expect(store.markQueued).toHaveBeenCalledOnce();
    expect(store.scheduleRetry).not.toHaveBeenCalled();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: lease.messageId,
        lane: lease.lane,
        errorType: 'Error',
      }),
      'Failed to persist outbound email queued state',
    );
  });
});
