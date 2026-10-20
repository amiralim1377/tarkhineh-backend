import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

import type {
  OutboundEmailDispatchStore,
  OutboundEmailDispatchLane,
  StaleQueuedOutboundEmailMessage,
} from '../../application/ports/outbound-email-dispatch-store.port.js';
import { OutboundEmailReconciler } from './outbound-email-reconciler.js';

function createCandidate(
  messageId: string,
  lane: OutboundEmailDispatchLane,
): StaleQueuedOutboundEmailMessage {
  return {
    messageId,
    lane,
    reconciledAt: new Date(),
  };
}

function createHarness() {
  const store = {
    findStaleQueuedMessages: vi.fn().mockResolvedValue([]),
    recoverMissingQueuedJob: vi.fn().mockResolvedValue(true),
  } as unknown as OutboundEmailDispatchStore;

  const transactionalQueue = {
    getJob: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;

  const bulkQueue = {
    getJob: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;

  const logger = {
    setContext: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;

  const reconciler = new OutboundEmailReconciler(
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
    reconciler,
  };
}

describe('OutboundEmailReconciler', () => {
  it('schedules recovery only when Redis confirms a queued Job is missing', async () => {
    const { store, transactionalQueue, reconciler } = createHarness();

    const candidate = createCandidate('outbox-missing-job', 'TRANSACTIONAL');

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);

    vi.mocked(transactionalQueue.getJob).mockResolvedValueOnce(undefined);

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.findStaleQueuedMessages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        lane: 'TRANSACTIONAL',
        batchSize: 100,
        queuedBefore: expect.any(Date),
        reconciledBefore: expect.any(Date),
        now: expect.any(Date),
      }),
    );

    expect(transactionalQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-outbox-missing-job',
    );

    expect(store.recoverMissingQueuedJob).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: candidate.messageId,
        lane: candidate.lane,
        queuedBefore: expect.any(Date),
        reconciledAt: candidate.reconciledAt,
        now: expect.any(Date),
        retryAt: expect.any(Date),
      }),
    );

    const recoveryInput = vi.mocked(store.recoverMissingQueuedJob).mock
      .calls[0]?.[0];

    expect(recoveryInput).toBeDefined();

    if (recoveryInput) {
      expect(recoveryInput.retryAt.getTime()).toBeGreaterThan(
        recoveryInput.now.getTime(),
      );
      expect(recoveryInput.reconciledAt).toEqual(candidate.reconciledAt);
    }
  });

  it('does not recover a message when its Job still exists', async () => {
    const { store, transactionalQueue, reconciler } = createHarness();

    const candidate = createCandidate('outbox-existing-job', 'TRANSACTIONAL');

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);

    vi.mocked(transactionalQueue.getJob).mockResolvedValueOnce({} as never);

    await reconciler.reconcileStaleQueuedMessages();

    expect(transactionalQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-outbox-existing-job',
    );

    expect(store.recoverMissingQueuedJob).not.toHaveBeenCalled();
  });

  it('does not treat a Redis read failure as a missing Job', async () => {
    const { store, transactionalQueue, logger, reconciler } = createHarness();

    const candidate = createCandidate('outbox-redis-error', 'TRANSACTIONAL');

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);

    vi.mocked(transactionalQueue.getJob).mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.recoverMissingQueuedJob).not.toHaveBeenCalled();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: candidate.messageId,
        lane: candidate.lane,
        errorType: 'Error',
      }),
      'Unable to verify outbound email Job existence',
    );
  });

  it('continues to reconcile the bulk lane if reading transactional candidates fails', async () => {
    const { store, bulkQueue, logger, reconciler } = createHarness();

    const bulkCandidate = createCandidate('bulk-missing-job', 'BULK');

    vi.mocked(store.findStaleQueuedMessages)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce([bulkCandidate]);

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.findStaleQueuedMessages).toHaveBeenCalledTimes(2);

    expect(bulkQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-bulk-missing-job',
    );

    expect(store.recoverMissingQueuedJob).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: bulkCandidate.messageId,
        lane: 'BULK',
        reconciledAt: bulkCandidate.reconciledAt,
      }),
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'TRANSACTIONAL',
        errorType: 'Error',
      }),
      'Failed to read stale outbound email messages',
    );
  });

  it('does not fail the whole pass when persisting recovery fails', async () => {
    const { store, bulkQueue, logger, reconciler } = createHarness();

    const transactionalCandidate = createCandidate(
      'outbox-recovery-write-error',
      'TRANSACTIONAL',
    );

    const bulkCandidate = createCandidate('bulk-recovery-after-error', 'BULK');

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([transactionalCandidate])
      .mockResolvedValueOnce([bulkCandidate]);

    vi.mocked(store.recoverMissingQueuedJob)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce(true);

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.recoverMissingQueuedJob).toHaveBeenCalledTimes(2);

    expect(store.recoverMissingQueuedJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messageId: transactionalCandidate.messageId,
        reconciledAt: transactionalCandidate.reconciledAt,
      }),
    );

    expect(store.recoverMissingQueuedJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messageId: bulkCandidate.messageId,
        reconciledAt: bulkCandidate.reconciledAt,
      }),
    );

    expect(bulkQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-bulk-recovery-after-error',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: transactionalCandidate.messageId,
        errorType: 'Error',
      }),
      'Failed to persist missing outbound email Job recovery',
    );
  });
});
