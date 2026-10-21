import { describe, expect, it, vi } from 'vitest';

import { PrismaOutboundEmailDeliveryStore } from './prisma-outbound-email-delivery.store.js';

import type { PrismaService } from '../../../../prisma/prisma.service.js';

interface MessageRow {
  aggregateType: string | null;
  aggregateId: string | null;
}

interface ChallengeRow {
  consumed: boolean;
  invalidated: boolean;
  expired: boolean;
}

interface HarnessOptions {
  messageRows: MessageRow[];
  challengeOwnerRows: Array<{ userId: string }>;
  challengeRows: ChallengeRow[];
  messageExpirationUpdateCount: number;
  lateMessageExpirationUpdateCount: number;
  cancellationUpdateCount: number;
  challengeExpirationUpdateCount: number;
  renewLeaseUpdateCount: number;
}

const defaultOptions: HarnessOptions = {
  messageRows: [
    {
      aggregateType: 'PasswordResetChallenge',
      aggregateId: 'challenge-1',
    },
  ],
  challengeOwnerRows: [{ userId: 'user-1' }],
  challengeRows: [{ consumed: false, invalidated: false, expired: false }],
  messageExpirationUpdateCount: 0,
  lateMessageExpirationUpdateCount: 0,
  cancellationUpdateCount: 1,
  challengeExpirationUpdateCount: 1,
  renewLeaseUpdateCount: 1,
};

const prepareInput = {
  messageId: 'outbound-message-1',
  leaseToken: 'worker-1:lease-1',
  leaseDurationMs: 60_000,
};

function getSql(call: readonly unknown[]): string {
  const template = call[0];
  return Array.isArray(template) ? template.join(' ') : String(template);
}

function createHarness(overrides: Partial<HarnessOptions> = {}) {
  const options: HarnessOptions = { ...defaultOptions, ...overrides };
  const queryRaw = vi.fn();
  const executeRaw = vi.fn();

  const transactionClient = { $queryRaw: queryRaw, $executeRaw: executeRaw };

  queryRaw.mockImplementation(async (template: TemplateStringsArray) => {
    const sql = template.join(' ');

    if (sql.includes('FROM public."OutboundEmailMessage"')) {
      return options.messageRows;
    }

    if (
      sql.includes('SELECT "userId"') &&
      sql.includes('FROM public."PasswordResetChallenge"')
    ) {
      return options.challengeOwnerRows;
    }

    if (sql.includes('FROM public."User"') && sql.includes('FOR UPDATE')) {
      return [{ id: 'user-1' }];
    }

    if (sql.includes('"consumedAt" IS NOT NULL')) {
      return options.challengeRows;
    }

    throw new Error(`Unexpected query in test: ${sql}`);
  });

  let messageExpirationUpdateCalls = 0;

  executeRaw.mockImplementation(async (template: TemplateStringsArray) => {
    const sql = template.join(' ');

    if (sql.includes('"validUntil" IS NOT NULL')) {
      const isLateExpirationUpdate = messageExpirationUpdateCalls > 0;
      messageExpirationUpdateCalls += 1;

      return isLateExpirationUpdate
        ? options.lateMessageExpirationUpdateCount
        : options.messageExpirationUpdateCount;
    }

    if (sql.includes("'CHALLENGE_EXPIRED'")) {
      return options.challengeExpirationUpdateCount;
    }

    if (sql.includes('\'CANCELLED\'::"OutboundEmailStatus"')) {
      return options.cancellationUpdateCount;
    }

    if (/SET\s+"lockedUntil"/.test(sql)) {
      return options.renewLeaseUpdateCount;
    }

    throw new Error(`Unexpected update in test: ${sql}`);
  });

  const prisma = {
    $transaction: vi.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  } as unknown as PrismaService;

  return {
    store: new PrismaOutboundEmailDeliveryStore(prisma),
    queryRaw,
    executeRaw,
  };
}

describe('PrismaOutboundEmailDeliveryStore.prepareForDelivery', () => {
  it('returns READY for a valid password-reset challenge and locks User before re-reading eligibility', async () => {
    const harness = createHarness();

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'READY',
    );

    const queries = harness.queryRaw.mock.calls.map((call: unknown[]) =>
      getSql(call),
    );
    const userLockIndex = queries.findIndex(
      (sql: string) =>
        sql.includes('FROM public."User"') && sql.includes('FOR UPDATE'),
    );
    const eligibilityReadIndex = queries.findIndex((sql: string) =>
      sql.includes('"consumedAt" IS NOT NULL'),
    );

    expect(userLockIndex).toBeGreaterThan(-1);
    expect(eligibilityReadIndex).toBeGreaterThan(userLockIndex);
    expect(harness.executeRaw).toHaveBeenCalledTimes(2);
  });

  it.each<[string, ChallengeRow]>([
    ['consumed', { consumed: true, invalidated: false, expired: false }],
    ['invalidated', { consumed: false, invalidated: true, expired: false }],
  ])(
    'cancels a %s password-reset challenge without preparing delivery',
    async (_label, challenge) => {
      const harness = createHarness({ challengeRows: [challenge] });

      await expect(
        harness.store.prepareForDelivery(prepareInput),
      ).resolves.toBe('CANCELLED');

      const cancellationCall = harness.executeRaw.mock.calls.find(
        (call: unknown[]) =>
          getSql(call).includes('\'CANCELLED\'::"OutboundEmailStatus"'),
      );

      expect(cancellationCall).toBeDefined();
      const cancellationSql = getSql(cancellationCall as unknown[]);
      expect(cancellationSql).toContain('"encryptedPayload" = NULL');
      expect(cancellationSql).toContain('"lockedBy" = NULL');
      expect(cancellationSql).toContain('"lockedUntil" = NULL');
      expect(cancellationSql).toContain("'CHALLENGE_INELIGIBLE'");
      expect(
        harness.executeRaw.mock.calls.some((call: unknown[]) =>
          /SET\s+"lockedUntil"\s*=/.test(getSql(call)),
        ),
      ).toBe(false);
    },
  );

  it('expires a password-reset message when its challenge has expired', async () => {
    const harness = createHarness({
      challengeRows: [{ consumed: false, invalidated: false, expired: true }],
    });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'EXPIRED',
    );

    const expiryCall = harness.executeRaw.mock.calls.find((call: unknown[]) =>
      getSql(call).includes("'CHALLENGE_EXPIRED'"),
    );

    expect(expiryCall).toBeDefined();
    expect(getSql(expiryCall as unknown[])).toContain(
      '"encryptedPayload" = NULL',
    );
    expect(getSql(expiryCall as unknown[])).toContain('"lockedBy" = NULL');
    expect(getSql(expiryCall as unknown[])).toContain('"lockedUntil" = NULL');
  });

  it('cancels delivery when the associated challenge no longer exists', async () => {
    const harness = createHarness({ challengeRows: [] });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'CANCELLED',
    );
  });

  it('gives message expiration precedence when a password-reset aggregate ID is missing', async () => {
    const harness = createHarness({
      messageRows: [
        { aggregateType: 'PasswordResetChallenge', aggregateId: null },
      ],
      messageExpirationUpdateCount: 1,
    });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'EXPIRED',
    );

    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
    expect(harness.executeRaw).toHaveBeenCalledTimes(1);
    expect(getSql(harness.executeRaw.mock.calls[0] as unknown[])).toContain(
      "'MESSAGE_EXPIRED'",
    );
  });

  it('cancels a non-expired password-reset message when its aggregate ID is missing', async () => {
    const harness = createHarness({
      messageRows: [
        { aggregateType: 'PasswordResetChallenge', aggregateId: null },
      ],
    });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'CANCELLED',
    );

    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('preserves normal delivery for messages unrelated to password-reset challenges', async () => {
    const harness = createHarness({
      messageRows: [{ aggregateType: 'Order', aggregateId: 'order-1' }],
    });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'READY',
    );

    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
    expect(harness.executeRaw).toHaveBeenCalledTimes(2);
  });

  it('returns LEASE_LOST without updating a message that is no longer leased to this worker', async () => {
    const harness = createHarness({ messageRows: [] });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'LEASE_LOST',
    );

    expect(harness.executeRaw).not.toHaveBeenCalled();
  });

  it('uses a lease-guarded initial read before checking challenge state', async () => {
    const harness = createHarness();

    await harness.store.prepareForDelivery(prepareInput);

    const initialRead = getSql(harness.queryRaw.mock.calls[0] as unknown[]);
    expect(initialRead).toContain(
      '"status" = \'PROCESSING\'::"OutboundEmailStatus"',
    );
    expect(initialRead).toContain('"lockedBy" =');
    expect(initialRead).toContain('"lockedUntil" > timezone');
  });

  it('expires the message when it expires between the initial check and lease renewal', async () => {
    const harness = createHarness({
      renewLeaseUpdateCount: 0,
      lateMessageExpirationUpdateCount: 1,
    });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'EXPIRED',
    );

    expect(harness.executeRaw).toHaveBeenCalledTimes(3);

    const lateExpirationCall = harness.executeRaw.mock.calls[2] as unknown[];
    const sql = getSql(lateExpirationCall);

    expect(sql).toContain('\'EXPIRED\'::"OutboundEmailStatus"');
    expect(sql).toContain('"encryptedPayload" = NULL');
    expect(sql).toContain('"lockedBy" = NULL');
    expect(sql).toContain('"lockedUntil" = NULL');
    expect(sql).toContain("'MESSAGE_EXPIRED'");
  });

  it('returns LEASE_LOST when lease renewal fails and the message has not expired', async () => {
    const harness = createHarness({
      renewLeaseUpdateCount: 0,
      lateMessageExpirationUpdateCount: 0,
    });

    await expect(harness.store.prepareForDelivery(prepareInput)).resolves.toBe(
      'LEASE_LOST',
    );

    expect(harness.executeRaw).toHaveBeenCalledTimes(3);
  });
});
