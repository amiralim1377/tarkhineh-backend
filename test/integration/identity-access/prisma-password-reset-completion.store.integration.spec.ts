import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PasswordResetCompletionStoreInput } from '../../../src/contexts/identity-access/application/ports/password-reset-completion-store.port.js';
import { PrismaPasswordResetCompletionStore } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-password-reset-completion.store.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

// -----------------------------------------------------------------------------
// Database configuration
// -----------------------------------------------------------------------------

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

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

const store = new PrismaPasswordResetCompletionStore(prisma);

// Track test data so we can remove it after every test.
const testEmails: string[] = [];
const testOutboxKeys: string[] = [];

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

type TestUserOptions = {
  status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  emailVerified?: boolean;
  passwordHash?: string | null;
};

type ChallengeOptions = {
  expiresAt?: Date;
  consumedAt?: Date | null;
  invalidatedAt?: Date | null;
};

type TestOutboxStatus =
  | 'PENDING'
  | 'DISPATCHING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'RETRY_SCHEDULED'
  | 'OUTCOME_UNKNOWN'
  | 'ACCEPTED'
  | 'DEAD';

const cancellableOutboxStatuses = [
  'PENDING',
  'DISPATCHING',
  'QUEUED',
  'RETRY_SCHEDULED',
] as const;

function createTokenHash(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

function createInput(
  tokenHash: string,
  now = new Date(),
  passwordHash = 'new-integration-test-password-hash',
): PasswordResetCompletionStoreInput {
  return {
    tokenHash,
    passwordHash,
    now,
  };
}

async function createActiveUser(
  options: TestUserOptions = {},
): Promise<{ id: string; email: string }> {
  const email = `password-reset-completion-${randomUUID()}@example.com`;

  testEmails.push(email);

  const passwordHash =
    options.passwordHash === undefined
      ? 'old-integration-test-password-hash'
      : options.passwordHash;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: 'Password Reset Integration User',
      status: options.status ?? 'ACTIVE',
      emailVerifiedAt: options.emailVerified === false ? null : new Date(),
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user.email) {
    throw new Error('Expected the test user to have an email');
  }

  return {
    id: user.id,
    email: user.email,
  };
}

async function createExistingChallenge(
  userId: string,
  email: string,
  options: ChallengeOptions = {},
): Promise<{ id: string; tokenHash: string }> {
  const tokenHash = createTokenHash();

  const challenge = await prisma.passwordResetChallenge.create({
    data: {
      userId,
      email,
      tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      ...(options.consumedAt !== undefined
        ? { consumedAt: options.consumedAt }
        : {}),
      ...(options.invalidatedAt !== undefined
        ? { invalidatedAt: options.invalidatedAt }
        : {}),
    },
    select: {
      id: true,
      tokenHash: true,
    },
  });

  return challenge;
}

async function createExistingOutboxMessage(
  aggregateId: string,
  status: TestOutboxStatus,
): Promise<string> {
  const idempotencyKey = `password-reset-completion-integration:${randomUUID()}`;

  testOutboxKeys.push(idempotencyKey);

  const now = new Date();

  const hasLease =
    status === 'DISPATCHING' ||
    status === 'QUEUED' ||
    status === 'PROCESSING' ||
    status === 'RETRY_SCHEDULED';

  await prisma.outboundEmailMessage.create({
    data: {
      idempotencyKey,
      lane: 'TRANSACTIONAL',
      templateKey: 'identity.password-reset',
      payloadVersion: 1,
      encryptedPayload: 'v1:integration-test-encrypted-payload',
      status,
      availableAt: now,
      validUntil: new Date(now.getTime() + 60 * 60 * 1000),
      aggregateType: 'PasswordResetChallenge',
      aggregateId,
      lockedBy: hasLease ? 'integration-test-worker' : null,
      lockedUntil: hasLease ? new Date(now.getTime() + 60 * 1000) : null,
    },
  });

  return idempotencyKey;
}

async function createSessionAndRefreshToken(
  userId: string,
): Promise<{ sessionId: string; refreshTokenId: string }> {
  const session = await prisma.authSession.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: {
      id: true,
    },
  });

  const refreshToken = await prisma.refreshToken.create({
    data: {
      sessionId: session.id,
      tokenHash: createTokenHash(),
      csrfTokenHash: createTokenHash(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: {
      id: true,
    },
  });

  return {
    sessionId: session.id,
    refreshTokenId: refreshToken.id,
  };
}

// -----------------------------------------------------------------------------
// Failure injection
// -----------------------------------------------------------------------------

/**
 * Executes the real database transaction, but makes refreshToken.updateMany
 * fail. This lets us verify that earlier writes are rolled back.
 */
function createStoreWithFailingRefreshTokenUpdate(
  client: PrismaService,
): PrismaPasswordResetCompletionStore {
  const prismaWithFailure = new Proxy(client, {
    get(target, property, receiver) {
      if (property !== '$transaction') {
        return Reflect.get(target, property, receiver);
      }

      return (callback: (transactionClient: unknown) => Promise<unknown>) =>
        target.$transaction(async (tx) => {
          const transactionWithFailure = new Proxy(tx, {
            get(transactionTarget, transactionProperty) {
              if (transactionProperty !== 'refreshToken') {
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionTarget,
                );
              }

              const delegate = Reflect.get(
                transactionTarget,
                transactionProperty,
                transactionTarget,
              ) as object;

              return new Proxy(delegate, {
                get(delegateTarget, method) {
                  if (method === 'updateMany') {
                    return async () => {
                      throw new Error('Injected refresh-token update failure');
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

  return new PrismaPasswordResetCompletionStore(prismaWithFailure);
}

// -----------------------------------------------------------------------------
// Test suite
// -----------------------------------------------------------------------------

describe('PrismaPasswordResetCompletionStore integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    try {
      if (testEmails.length > 0) {
        const users = await prisma.user.findMany({
          where: {
            email: {
              in: [...testEmails],
            },
          },
          select: {
            passwordResetChallenges: {
              select: {
                id: true,
              },
            },
          },
        });

        const challengeIds = users.flatMap((user) =>
          user.passwordResetChallenges.map((challenge) => challenge.id),
        );

        // OutboundEmailMessage doesn't have a foreign key to the challenge.
        // Delete related messages explicitly before deleting users.
        if (challengeIds.length > 0) {
          await prisma.outboundEmailMessage.deleteMany({
            where: {
              aggregateType: 'PasswordResetChallenge',
              aggregateId: {
                in: challengeIds,
              },
            },
          });
        }

        await prisma.user.deleteMany({
          where: {
            email: {
              in: [...testEmails],
            },
          },
        });
      }

      if (testOutboxKeys.length > 0) {
        await prisma.outboundEmailMessage.deleteMany({
          where: {
            idempotencyKey: {
              in: [...testOutboxKeys],
            },
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

  // ---------------------------------------------------------------------------
  // Successful completion
  // ---------------------------------------------------------------------------

  it('updates the password, consumes the challenge, and revokes sessions and refresh tokens', async () => {
    const user = await createActiveUser();
    const now = new Date();

    const challenge = await createExistingChallenge(user.id, user.email, {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    // Create two active sessions to verify that all sessions are revoked.
    const firstSession = await createSessionAndRefreshToken(user.id);
    const secondSession = await createSessionAndRefreshToken(user.id);

    const input = createInput(challenge.tokenHash, now);

    const result = await store.completePasswordReset(input);

    expect(result).toBe(true);

    const updatedUser = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        passwordHash: true,
      },
    });

    expect(updatedUser?.passwordHash).toBe(input.passwordHash);

    const updatedChallenge = await prisma.passwordResetChallenge.findUnique({
      where: {
        id: challenge.id,
      },
      select: {
        consumedAt: true,
        invalidatedAt: true,
      },
    });

    expect(updatedChallenge).toEqual({
      consumedAt: now,
      invalidatedAt: null,
    });

    const sessions = await prisma.authSession.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(sessions).toHaveLength(2);

    for (const session of sessions) {
      expect(session.revokedAt).toEqual(now);
      expect(session.revocationReason).toBe('SECURITY_ACTION');
    }

    const refreshTokens = await prisma.refreshToken.findMany({
      where: {
        session: {
          is: {
            userId: user.id,
          },
        },
      },
      select: {
        id: true,
        revokedAt: true,
      },
    });

    expect(refreshTokens).toHaveLength(2);

    for (const refreshToken of refreshTokens) {
      expect(refreshToken.revokedAt).toEqual(now);
    }

    expect([firstSession.sessionId, secondSession.sessionId]).toHaveLength(2);

    expect([
      firstSession.refreshTokenId,
      secondSession.refreshTokenId,
    ]).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Missing or invalid challenges
  // ---------------------------------------------------------------------------

  it('returns false when the token hash does not exist', async () => {
    const input = createInput(createTokenHash());

    const result = await store.completePasswordReset(input);

    expect(result).toBe(false);
  });

  const invalidChallengeCases = [
    { name: 'expired', state: 'expired' },
    { name: 'already consumed', state: 'consumed' },
    { name: 'already invalidated', state: 'invalidated' },
  ] as const;

  it.each(invalidChallengeCases)(
    'returns false when the challenge is $name',
    async ({ state }) => {
      const user = await createActiveUser();
      const now = new Date();

      const challengeOptions: ChallengeOptions = {};

      if (state === 'expired') {
        challengeOptions.expiresAt = new Date(now.getTime() - 1000);
      } else if (state === 'consumed') {
        challengeOptions.consumedAt = new Date(now.getTime() - 1000);
      } else {
        challengeOptions.invalidatedAt = new Date(now.getTime() - 1000);
      }

      const challenge = await createExistingChallenge(
        user.id,
        user.email,
        challengeOptions,
      );

      const result = await store.completePasswordReset(
        createInput(challenge.tokenHash, now),
      );

      expect(result).toBe(false);

      const unchangedUser = await prisma.user.findUnique({
        where: {
          id: user.id,
        },
        select: {
          passwordHash: true,
        },
      });

      expect(unchangedUser?.passwordHash).toBe(
        'old-integration-test-password-hash',
      );
    },
  );

  // ---------------------------------------------------------------------------
  // User eligibility
  // ---------------------------------------------------------------------------

  const ineligibleUserCases = [
    {
      name: 'PENDING user',
      options: { status: 'PENDING' as const },
    },
    {
      name: 'SUSPENDED user',
      options: { status: 'SUSPENDED' as const },
    },
    {
      name: 'unverified email',
      options: { emailVerified: false },
    },
    {
      name: 'user without a password hash',
      options: { passwordHash: null },
    },
  ];

  it.each(ineligibleUserCases)(
    'returns false for an ineligible user: $name',
    async ({ options }) => {
      const user = await createActiveUser(options);
      const now = new Date();

      const challenge = await createExistingChallenge(user.id, user.email, {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });

      const result = await store.completePasswordReset(
        createInput(challenge.tokenHash, now),
      );

      expect(result).toBe(false);

      const unchangedUser = await prisma.user.findUnique({
        where: {
          id: user.id,
        },
        select: {
          passwordHash: true,
        },
      });

      expect(unchangedUser?.passwordHash).toBe(
        options.passwordHash === null
          ? null
          : 'old-integration-test-password-hash',
      );

      const unchangedChallenge = await prisma.passwordResetChallenge.findUnique(
        {
          where: {
            id: challenge.id,
          },
          select: {
            consumedAt: true,
          },
        },
      );

      expect(unchangedChallenge?.consumedAt).toBeNull();
    },
  );

  // ---------------------------------------------------------------------------
  // Input validation
  // ---------------------------------------------------------------------------

  it('throws TypeError for an invalid token hash', async () => {
    await expect(
      store.completePasswordReset(
        createInput('this-is-not-a-valid-token-hash'),
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('throws TypeError when the new password hash is empty', async () => {
    const input = {
      ...createInput(createTokenHash()),
      passwordHash: '   ',
    };

    await expect(store.completePasswordReset(input)).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it('throws RangeError when the timestamp is invalid', async () => {
    const input = createInput(createTokenHash(), new Date(Number.NaN));

    await expect(store.completePasswordReset(input)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  // ---------------------------------------------------------------------------
  // Cancellation of the consumed challenge's email
  // ---------------------------------------------------------------------------

  it.each(cancellableOutboxStatuses)(
    'cancels the consumed challenge email when its status is %s',
    async (status) => {
      const user = await createActiveUser();
      const now = new Date();

      const challenge = await createExistingChallenge(user.id, user.email, {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });

      const idempotencyKey = await createExistingOutboxMessage(
        challenge.id,
        status,
      );

      const result = await store.completePasswordReset(
        createInput(challenge.tokenHash, now),
      );

      expect(result).toBe(true);

      const message = await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: {
          idempotencyKey,
        },
      });

      expect(message).toMatchObject({
        status: 'CANCELLED',
        cancelledAt: now,
        encryptedPayload: null,
        lockedBy: null,
        lockedUntil: null,
        lastErrorCode: 'CHALLENGE_INELIGIBLE',
      });
    },
  );

  it('clears the consumed challenge email payload when its outcome is unknown without changing its status', async () => {
    const user = await createActiveUser();
    const now = new Date();

    const challenge = await createExistingChallenge(user.id, user.email, {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const idempotencyKey = await createExistingOutboxMessage(
      challenge.id,
      'OUTCOME_UNKNOWN',
    );

    const result = await store.completePasswordReset(
      createInput(challenge.tokenHash, now),
    );

    expect(result).toBe(true);

    const message = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey,
      },
    });

    expect(message.status).toBe('OUTCOME_UNKNOWN');
    expect(message.encryptedPayload).toBeNull();
  });

  it.each(['PROCESSING', 'ACCEPTED', 'DEAD'] as const)(
    'does not change a consumed challenge email already in status %s',
    async (status) => {
      const user = await createActiveUser();
      const now = new Date();

      const challenge = await createExistingChallenge(user.id, user.email, {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });

      const idempotencyKey = await createExistingOutboxMessage(
        challenge.id,
        status,
      );

      const result = await store.completePasswordReset(
        createInput(challenge.tokenHash, now),
      );

      expect(result).toBe(true);

      const message = await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: {
          idempotencyKey,
        },
      });

      expect(message.status).toBe(status);
      expect(message.encryptedPayload).toBe(
        'v1:integration-test-encrypted-payload',
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Invalidation of other challenges and their emails
  // ---------------------------------------------------------------------------

  it.each(cancellableOutboxStatuses)(
    'invalidates an older challenge and cancels its email when status is %s',
    async (status) => {
      const user = await createActiveUser();
      const now = new Date();

      const currentChallenge = await createExistingChallenge(
        user.id,
        user.email,
        {
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        },
      );

      const olderChallenge = await createExistingChallenge(
        user.id,
        user.email,
        {
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        },
      );

      const idempotencyKey = await createExistingOutboxMessage(
        olderChallenge.id,
        status,
      );

      const result = await store.completePasswordReset(
        createInput(currentChallenge.tokenHash, now),
      );

      expect(result).toBe(true);

      const invalidatedChallenge =
        await prisma.passwordResetChallenge.findUniqueOrThrow({
          where: {
            id: olderChallenge.id,
          },
        });

      expect(invalidatedChallenge.invalidatedAt).toEqual(now);

      const message = await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: {
          idempotencyKey,
        },
      });

      expect(message).toMatchObject({
        status: 'CANCELLED',
        cancelledAt: now,
        encryptedPayload: null,
        lockedBy: null,
        lockedUntil: null,
        lastErrorCode: 'CHALLENGE_SUPERSEDED',
      });
    },
  );

  it('invalidates other active challenges and clears unknown-outcome email payloads without retrying them', async () => {
    const user = await createActiveUser();
    const now = new Date();

    const currentChallenge = await createExistingChallenge(
      user.id,
      user.email,
      {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    );

    const olderChallenge = await createExistingChallenge(user.id, user.email, {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const idempotencyKey = await createExistingOutboxMessage(
      olderChallenge.id,
      'OUTCOME_UNKNOWN',
    );

    const result = await store.completePasswordReset(
      createInput(currentChallenge.tokenHash, now),
    );

    expect(result).toBe(true);

    const invalidatedChallenge =
      await prisma.passwordResetChallenge.findUniqueOrThrow({
        where: {
          id: olderChallenge.id,
        },
      });

    expect(invalidatedChallenge.invalidatedAt).toEqual(now);

    const message = await prisma.outboundEmailMessage.findUniqueOrThrow({
      where: {
        idempotencyKey,
      },
    });

    expect(message.status).toBe('OUTCOME_UNKNOWN');
    expect(message.encryptedPayload).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Transaction rollback
  // ---------------------------------------------------------------------------

  it('rolls back challenge, password, session, and email changes when refresh-token revocation fails', async () => {
    const user = await createActiveUser();
    const now = new Date();

    const currentChallenge = await createExistingChallenge(
      user.id,
      user.email,
      {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    );

    const olderChallenge = await createExistingChallenge(user.id, user.email, {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const olderMessageKey = await createExistingOutboxMessage(
      olderChallenge.id,
      'PENDING',
    );

    const session = await createSessionAndRefreshToken(user.id);

    const failingStore = createStoreWithFailingRefreshTokenUpdate(prisma);

    await expect(
      failingStore.completePasswordReset(
        createInput(currentChallenge.tokenHash, now),
      ),
    ).rejects.toThrow();

    const unchangedUser = await prisma.user.findUniqueOrThrow({
      where: {
        id: user.id,
      },
      select: {
        passwordHash: true,
      },
    });

    expect(unchangedUser.passwordHash).toBe(
      'old-integration-test-password-hash',
    );

    const unchangedCurrentChallenge =
      await prisma.passwordResetChallenge.findUniqueOrThrow({
        where: {
          id: currentChallenge.id,
        },
        select: {
          consumedAt: true,
        },
      });

    expect(unchangedCurrentChallenge.consumedAt).toBeNull();

    const unchangedOlderChallenge =
      await prisma.passwordResetChallenge.findUniqueOrThrow({
        where: {
          id: olderChallenge.id,
        },
        select: {
          invalidatedAt: true,
        },
      });

    expect(unchangedOlderChallenge.invalidatedAt).toBeNull();

    const unchangedSession = await prisma.authSession.findUniqueOrThrow({
      where: {
        id: session.sessionId,
      },
      select: {
        revokedAt: true,
        revocationReason: true,
      },
    });

    expect(unchangedSession).toEqual({
      revokedAt: null,
      revocationReason: null,
    });

    const unchangedRefreshToken = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        id: session.refreshTokenId,
      },
      select: {
        revokedAt: true,
      },
    });

    expect(unchangedRefreshToken.revokedAt).toBeNull();

    const unchangedMessage =
      await prisma.outboundEmailMessage.findUniqueOrThrow({
        where: {
          idempotencyKey: olderMessageKey,
        },
      });

    expect(unchangedMessage.status).toBe('PENDING');
    expect(unchangedMessage.encryptedPayload).toBe(
      'v1:integration-test-encrypted-payload',
    );
  });

  // ---------------------------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------------------------

  it('allows only one concurrent completion for the same challenge', async () => {
    const user = await createActiveUser();
    const now = new Date();

    const challenge = await createExistingChallenge(user.id, user.email, {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const firstInput = createInput(
      challenge.tokenHash,
      now,
      'first-new-integration-test-password-hash',
    );

    const secondInput = createInput(
      challenge.tokenHash,
      now,
      'second-new-integration-test-password-hash',
    );

    const results = await Promise.all([
      store.completePasswordReset(firstInput),
      store.completePasswordReset(secondInput),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);

    const finalUser = await prisma.user.findUniqueOrThrow({
      where: {
        id: user.id,
      },
      select: {
        passwordHash: true,
      },
    });

    expect([
      'first-new-integration-test-password-hash',
      'second-new-integration-test-password-hash',
    ]).toContain(finalUser.passwordHash);

    const finalChallenge =
      await prisma.passwordResetChallenge.findUniqueOrThrow({
        where: {
          id: challenge.id,
        },
        select: {
          consumedAt: true,
        },
      });

    expect(finalChallenge.consumedAt).not.toBeNull();
  });
});
