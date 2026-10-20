import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

import type {
  OutboundEmailDispatchStore,
  StaleQueuedOutboundEmailMessage,
} from '../../application/ports/outbound-email-dispatch-store.port.js';
import { OutboundEmailReconciler } from './outbound-email-reconciler.js';

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

    const candidate: StaleQueuedOutboundEmailMessage = {
      messageId: 'outbox-missing-job',
      lane: 'TRANSACTIONAL',
    };

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);

    vi.mocked(transactionalQueue.getJob).mockResolvedValueOnce(undefined);

    await reconciler.reconcileStaleQueuedMessages();

    expect(transactionalQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-outbox-missing-job',
    );

    expect(store.recoverMissingQueuedJob).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: candidate.messageId,
        lane: candidate.lane,
        queuedBefore: expect.any(Date),
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
    }
  });

  it('does not recover a message when its Job still exists', async () => {
    const { store, transactionalQueue, reconciler } = createHarness();

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([
        {
          messageId: 'outbox-existing-job',
          lane: 'TRANSACTIONAL',
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(transactionalQueue.getJob).mockResolvedValueOnce({} as never);

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.recoverMissingQueuedJob).not.toHaveBeenCalled();
  });

  it('does not treat a Redis read failure as a missing Job', async () => {
    const { store, transactionalQueue, logger, reconciler } = createHarness();

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([
        {
          messageId: 'outbox-redis-error',
          lane: 'TRANSACTIONAL',
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(transactionalQueue.getJob).mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.recoverMissingQueuedJob).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: 'outbox-redis-error',
        errorType: 'Error',
      }),
      'Unable to verify outbound email Job existence',
    );
  });

  it('continues to reconcile the bulk lane if reading transactional candidates fails', async () => {
    const { store, bulkQueue, logger, reconciler } = createHarness();

    vi.mocked(store.findStaleQueuedMessages)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce([
        {
          messageId: 'bulk-missing-job',
          lane: 'BULK',
        },
      ]);

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.findStaleQueuedMessages).toHaveBeenCalledTimes(2);
    expect(bulkQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-bulk-missing-job',
    );
    expect(store.recoverMissingQueuedJob).toHaveBeenCalledOnce();
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

    vi.mocked(store.findStaleQueuedMessages)
      .mockResolvedValueOnce([
        {
          messageId: 'outbox-recovery-write-error',
          lane: 'TRANSACTIONAL',
        },
      ])
      .mockResolvedValueOnce([
        {
          messageId: 'bulk-recovery-after-error',
          lane: 'BULK',
        },
      ]);

    vi.mocked(store.recoverMissingQueuedJob)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce(true);

    await reconciler.reconcileStaleQueuedMessages();

    expect(store.recoverMissingQueuedJob).toHaveBeenCalledTimes(2);
    expect(bulkQueue.getJob).toHaveBeenCalledWith(
      'outbound-email-bulk-recovery-after-error',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: 'outbox-recovery-write-error',
        errorType: 'Error',
      }),
      'Failed to persist missing outbound email Job recovery',
    );
  });
});
