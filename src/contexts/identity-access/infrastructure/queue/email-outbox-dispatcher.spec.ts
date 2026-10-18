import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { EmailOutboxDispatcher } from './email-outbox-dispatcher.js';

function createHarness(pendingMessages: Array<{ id: string }> = []) {
  const prisma = {
    emailOutboxMessage: {
      findMany: vi.fn().mockResolvedValue(pendingMessages),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const queue = {
    add: vi.fn().mockResolvedValue({ id: 'test-job' }),
  } as unknown as Queue;

  const logger = {
    setContext: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;

  const dispatcher = new EmailOutboxDispatcher(prisma, queue, logger);

  return { prisma, queue, logger, dispatcher };
}

describe('EmailOutboxDispatcher', () => {
  it('dispatches a pending message and marks it as queued', async () => {
    const { prisma, queue, dispatcher } = createHarness([{ id: 'outbox-123' }]);

    await dispatcher.dispatchPendingMessages();

    expect(prisma.emailOutboxMessage.findMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        availableAt: {
          lte: expect.any(Date),
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 50,
      select: {
        id: true,
      },
    });

    expect(queue.add).toHaveBeenCalledWith(
      'send-verification-email',
      {
        outboxMessageId: 'outbox-123',
      },
      expect.objectContaining({
        jobId: 'email-verification-outbox-123',
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }),
    );

    expect(prisma.emailOutboxMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-123',
        status: 'PENDING',
      },
      data: {
        status: 'QUEUED',
        enqueuedAt: expect.any(Date),
      },
    });
  });

  it('does not enqueue anything when there are no pending messages', async () => {
    const { prisma, queue, dispatcher } = createHarness();

    await dispatcher.dispatchPendingMessages();

    expect(prisma.emailOutboxMessage.findMany).toHaveBeenCalledOnce();
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.emailOutboxMessage.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a message pending when queue insertion fails', async () => {
    const { prisma, queue, logger, dispatcher } = createHarness([
      { id: 'outbox-456' },
    ]);

    vi.mocked(queue.add).mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(dispatcher.dispatchPendingMessages()).resolves.toBeUndefined();

    expect(queue.add).toHaveBeenCalledOnce();

    expect(prisma.emailOutboxMessage.updateMany).not.toHaveBeenCalled();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxMessageId: 'outbox-456',
        errorType: 'Error',
      }),
      'Failed to dispatch email outbox message',
    );
  });

  it('reuses the same job id if the outbox status update fails', async () => {
    const { prisma, queue, logger, dispatcher } = createHarness([
      { id: 'outbox-retry-123' },
    ]);

    vi.mocked(prisma.emailOutboxMessage.updateMany)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValue({ count: 1 });

    // Queue insertion succeeds, but updating PostgreSQL fails.
    await dispatcher.dispatchPendingMessages();

    // The message is still pending, so the next run sees it again.
    await dispatcher.dispatchPendingMessages();

    expect(queue.add).toHaveBeenCalledTimes(2);

    const expectedJob = [
      'send-verification-email',
      { outboxMessageId: 'outbox-retry-123' },
      expect.objectContaining({
        jobId: 'email-verification-outbox-retry-123',
        attempts: 5,
      }),
    ];

    expect(queue.add).toHaveBeenNthCalledWith(1, ...expectedJob);
    expect(queue.add).toHaveBeenNthCalledWith(2, ...expectedJob);

    expect(prisma.emailOutboxMessage.updateMany).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
