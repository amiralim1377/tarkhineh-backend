import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CreatePasswordResetRequestInput } from '../../../src/contexts/identity-access/application/ports/password-reset-request-store.port.js';
import { PrismaPasswordResetRequestStore } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-password-reset-request.store.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  // Refuse to redirect an unexpected database configuration.
  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run password-reset integration tests from an unexpected database URL',
    );
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}

const testDatabaseUrl = createTestDatabaseUrl();

const configService = {
  getOrThrow(key: string): string {
    if (key !== 'DATABASE_URL') {
      throw new Error(`Unexpected configuration key: ${key}`);
    }

    return testDatabaseUrl;
  },
} as unknown as ConfigService;

const prisma = new PrismaService(configService);
const store = new PrismaPasswordResetRequestStore(prisma);

const testEmails: string[] = [];
const testOutboxKeys: string[] = [];

function createTokenHash(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

function createRequestInput(
  email: string,
  now = new Date(),
): CreatePasswordResetRequestInput {
  return {
    email,
    tokenHash: createTokenHash(),
    now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    encryptedPayload: 'v1:integration-test-encrypted-payload',
  };
}

async function createActiveUser(): Promise<{
  id: string;
  email: string;
}> {
  const email = `password-reset-${randomUUID()}@example.com`;
  testEmails.push(email);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Password Reset Integration User',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
    },
  });

  return {
    id: user.id,
    email,
  };
}

async function createExistingChallenge(
  userId: string,
  email: string,
): Promise<string> {
  const challenge = await prisma.passwordResetChallenge.create({
    data: {
      userId,
      email,
      tokenHash: createTokenHash(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });

  return challenge.id;
}

async function createExistingOutboxMessage(
  aggregateId: string,
  status: 'PENDING' | 'OUTCOME_UNKNOWN',
): Promise<string> {
  const idempotencyKey = `password-reset-integration-${randomUUID()}`;
  testOutboxKeys.push(idempotencyKey);

  await prisma.outboundEmailMessage.create({
    data: {
      idempotencyKey,
      lane: 'TRANSACTIONAL',
      templateKey: 'identity.password-reset',
      payloadVersion: 1,
      encryptedPayload: 'v1:previous-encrypted-payload',
      status,
      availableAt: new Date(),
      validUntil: new Date(Date.now() + 60 * 60 * 1000),
      aggregateType: 'PasswordResetChallenge',
      aggregateId,
    },
  });

  return idempotencyKey;
}

/**
 * Wraps the real Prisma transaction client and injects a failure at
 * Outbox creation. Database operations before that point remain real.
 */
function createStoreWithFailingOutboxCreate(
  client: PrismaService,
): PrismaPasswordResetRequestStore {
  const prismaWithFailure = new Proxy(client, {
    get(target, property, receiver) {
      if (property !== '$transaction') {
        return Reflect.get(target, property, receiver);
      }

      return (callback: (transactionClient: unknown) => Promise<unknown>) =>
        target.$transaction(async (tx) => {
          const transactionWithFailure = new Proxy(tx, {
            get(transactionTarget, transactionProperty) {
              if (transactionProperty !== 'outboundEmailMessage') {
                const value = Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionTarget,
                ) as unknown;

                return typeof value === 'function'
                  ? value.bind(transactionTarget)
                  : value;
              }

              const delegate = Reflect.get(
                transactionTarget,
                transactionProperty,
                transactionTarget,
              ) as object;

              return new Proxy(delegate, {
                get(delegateTarget, method) {
                  if (method === 'create') {
                    return async () => {
                      throw new Error('Injected Outbox create failure');
                    };
                  }

                  const value = Reflect.get(
                    delegateTarget,
                    method,
                    delegateTarget,
                  ) as unknown;

                  return typeof value === 'function'
                    ? value.bind(delegateTarget)
                    : value;
                },
              });
            },
          });

          return callback(transactionWithFailure);
        });
    },
  }) as PrismaService;

  return new PrismaPasswordResetRequestStore(prismaWithFailure);
}

describe('PrismaPasswordResetRequestStore integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    try {
      if (testEmails.length > 0) {
        const users = await prisma.user.findMany({
          where: {
            email: { in: [...testEmails] },
          },
          select: {
            passwordResetChallenges: {
              select: { id: true },
            },
          },
        });

        const challengeIds = users.flatMap((user) =>
          user.passwordResetChallenges.map((challenge) => challenge.id),
        );

        // OutboundEmailMessage has no direct FK to the Challenge.
        // Delete its records explicitly before removing the users.
        if (challengeIds.length > 0) {
          await prisma.outboundEmailMessage.deleteMany({
            where: {
              aggregateType: 'PasswordResetChallenge',
              aggregateId: { in: challengeIds },
            },
          });
        }
      }

      if (testOutboxKeys.length > 0) {
        await prisma.outboundEmailMessage.deleteMany({
          where: {
            idempotencyKey: { in: [...testOutboxKeys] },
          },
        });
      }

      if (testEmails.length > 0) {
        await prisma.user.deleteMany({
          where: {
            email: { in: [...testEmails] },
          },
        });
      }
    } finally {
      testEmails.length = 0;
      testOutboxKeys.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists the Challenge and Outbox message together', async () => {
    const user = await createActiveUser();
    const input = createRequestInput(user.email);

    await store.createPasswordResetRequest(input);

    const challenge = await prisma.passwordResetChallenge.findUnique({
      where: { tokenHash: input.tokenHash },
    });

    expect(challenge).not.toBeNull();

    if (!challenge) {
      throw new Error('Expected the password reset Challenge to exist');
    }

    expect(challenge).toMatchObject({
      userId: user.id,
      email: user.email,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      invalidatedAt: null,
    });

    const outboxMessage = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: `password-reset:${challenge.id}`,
      },
    });

    expect(outboxMessage).toMatchObject({
      idempotencyKey: `password-reset:${challenge.id}`,
      lane: 'TRANSACTIONAL',
      templateKey: 'identity.password-reset',
      payloadVersion: 1,
      encryptedPayload: input.encryptedPayload,
      status: 'PENDING',
      validUntil: input.expiresAt,
      aggregateType: 'PasswordResetChallenge',
      aggregateId: challenge.id,
    });
  });

  it('does not create a Challenge for an unknown email', async () => {
    const input = createRequestInput(`missing-${randomUUID()}@example.com`);

    const beforeCount = await prisma.passwordResetChallenge.count();

    await store.createPasswordResetRequest(input);

    const afterCount = await prisma.passwordResetChallenge.count();

    expect(afterCount).toBe(beforeCount);

    const outboxMessage = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey: `password-reset:${input.tokenHash}`,
      },
    });

    expect(outboxMessage).toBeNull();
  });

  it('invalidates previous Challenges and handles their Outbox messages', async () => {
    const user = await createActiveUser();

    const pendingChallengeId = await createExistingChallenge(
      user.id,
      user.email,
    );
    const unknownChallengeId = await createExistingChallenge(
      user.id,
      user.email,
    );

    const pendingKey = await createExistingOutboxMessage(
      pendingChallengeId,
      'PENDING',
    );
    const unknownKey = await createExistingOutboxMessage(
      unknownChallengeId,
      'OUTCOME_UNKNOWN',
    );

    const input = createRequestInput(user.email);

    await store.createPasswordResetRequest(input);

    const previousChallenges = await prisma.passwordResetChallenge.findMany({
      where: {
        id: {
          in: [pendingChallengeId, unknownChallengeId],
        },
      },
    });

    expect(previousChallenges).toHaveLength(2);

    for (const challenge of previousChallenges) {
      expect(challenge.invalidatedAt).toEqual(input.now);
    }

    const pendingMessage = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: pendingKey },
    });

    expect(pendingMessage).toMatchObject({
      status: 'CANCELLED',
      cancelledAt: input.now,
      encryptedPayload: null,
      lockedBy: null,
      lockedUntil: null,
      lastErrorCode: 'CHALLENGE_SUPERSEDED',
    });

    const unknownMessage = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: { idempotencyKey: unknownKey },
    });

    expect(unknownMessage.status).toBe('OUTCOME_UNKNOWN');
    expect(unknownMessage.encryptedPayload).toBeNull();

    const newChallenge = await prisma.passwordResetChallenge.findUnique({
      where: { tokenHash: input.tokenHash },
    });

    expect(newChallenge).not.toBeNull();
  });

  it('rolls back the Challenge when Outbox creation fails', async () => {
    const user = await createActiveUser();
    const input = createRequestInput(user.email);

    const outboxCountBefore = await prisma.outboundEmailMessage.count();

    const failingStore = createStoreWithFailingOutboxCreate(prisma);

    await expect(
      failingStore.createPasswordResetRequest(input),
    ).rejects.toThrow();

    const challenge = await prisma.passwordResetChallenge.findUnique({
      where: { tokenHash: input.tokenHash },
    });

    expect(challenge).toBeNull();

    const outboxCountAfter = await prisma.outboundEmailMessage.count();

    expect(outboxCountAfter).toBe(outboxCountBefore);
  });

  it('serializes concurrent requests so only one Challenge remains active', async () => {
    const user = await createActiveUser();

    const firstInput = createRequestInput(user.email);
    const secondInput = createRequestInput(user.email);

    await Promise.all([
      store.createPasswordResetRequest(firstInput),
      store.createPasswordResetRequest(secondInput),
    ]);

    const challenges = await prisma.passwordResetChallenge.findMany({
      where: { userId: user.id },
    });

    expect(challenges).toHaveLength(2);

    const activeChallenges = challenges.filter(
      (challenge) =>
        challenge.consumedAt === null && challenge.invalidatedAt === null,
    );

    expect(activeChallenges).toHaveLength(1);

    const challengeIds = challenges.map((challenge) => challenge.id);

    const messages = await prisma.outboundEmailMessage.findMany({
      where: {
        aggregateType: 'PasswordResetChallenge',
        aggregateId: { in: challengeIds },
      },
    });

    expect(messages).toHaveLength(2);

    expect(messages.map((message) => message.status).sort()).toEqual([
      'CANCELLED',
      'PENDING',
    ]);
  });
});
