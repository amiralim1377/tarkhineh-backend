import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { IdentityUser } from '../../../src/contexts/identity-access/domain/entities/identity-user.js';
import { PrismaEmailRegistrationRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-registration.repository.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run integration tests against an unexpected database',
    );
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}

function createTokenHash(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

function createRegistrationInput(email: string, tokenHash: string) {
  const now = new Date();

  return {
    user: IdentityUser.registerPending({
      email,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Integration Test User',
    }),
    tokenHash,
    encryptedPayload: 'v1:integration-test-encrypted-payload',
    now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
  };
}

function createTestEmail(): string {
  return `integration-${randomUUID()}@example.com`;
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

const repository = new PrismaEmailRegistrationRepository(prisma);

const testEmails: string[] = [];

describe('PrismaEmailRegistrationRepository integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    try {
      if (testEmails.length === 0) {
        return;
      }

      // OutboundEmailMessage has no direct foreign key to the challenge.
      // Find challenge IDs first and explicitly delete their outbox messages.
      const challenges = await prisma.emailVerificationChallenge.findMany({
        where: {
          email: {
            in: [...testEmails],
          },
        },
        select: {
          id: true,
        },
      });

      const challengeIds = challenges.map((challenge) => challenge.id);

      if (challengeIds.length > 0) {
        await prisma.outboundEmailMessage.deleteMany({
          where: {
            aggregateType: 'EmailVerificationChallenge',
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
    } finally {
      testEmails.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists the user, verification challenge and outbox message', async () => {
    const email = createTestEmail();
    testEmails.push(email);

    const tokenHash = createTokenHash();
    const registration = createRegistrationInput(email, tokenHash);

    const result = await repository.createPendingRegistration(registration);

    expect(result).toBe(true);

    // Verify the user independently of the challenge and outbox.
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        passwordHash: true,
        displayName: true,
      },
    });

    expect(user).not.toBeNull();

    if (!user) {
      throw new Error('Expected the test user to exist');
    }

    expect(user).toMatchObject({
      id: registration.user.id,
      email,
      status: 'PENDING',
      emailVerifiedAt: null,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Integration Test User',
    });

    // EmailVerificationChallenge no longer has an outboxMessage relation.
    const challenge = await prisma.emailVerificationChallenge.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        userId: true,
        email: true,
        tokenHash: true,
        consumedAt: true,
        expiresAt: true,
      },
    });

    expect(challenge).not.toBeNull();

    if (!challenge) {
      throw new Error('Expected the verification challenge to exist');
    }

    expect(challenge).toMatchObject({
      userId: user.id,
      email,
      tokenHash,
      consumedAt: null,
      expiresAt: registration.expiresAt,
    });

    // Find the outbox message through its aggregate reference.
    const outboxMessages = await prisma.outboundEmailMessage.findMany({
      where: {
        aggregateType: 'EmailVerificationChallenge',
        aggregateId: challenge.id,
      },
    });

    expect(outboxMessages).toHaveLength(1);

    expect(outboxMessages[0]).toMatchObject({
      aggregateType: 'EmailVerificationChallenge',
      aggregateId: challenge.id,
      lane: 'TRANSACTIONAL',
      encryptedPayload: registration.encryptedPayload,
      status: 'PENDING',
      validUntil: registration.expiresAt,
    });
  });

  it('rolls back user and challenge creation when challenge creation fails', async () => {
    const firstEmail = createTestEmail();
    const secondEmail = createTestEmail();

    testEmails.push(firstEmail, secondEmail);

    // Reusing a unique token hash causes the second challenge creation to fail.
    const duplicateTokenHash = createTokenHash();

    const firstRegistration = createRegistrationInput(
      firstEmail,
      duplicateTokenHash,
    );

    const firstResult =
      await repository.createPendingRegistration(firstRegistration);

    expect(firstResult).toBe(true);

    const secondRegistration = createRegistrationInput(
      secondEmail,
      duplicateTokenHash,
    );

    await expect(
      repository.createPendingRegistration(secondRegistration),
    ).rejects.toThrow();

    // The second user's creation must have been rolled back.
    const secondUser = await prisma.user.findUnique({
      where: {
        email: secondEmail,
      },
      select: {
        id: true,
      },
    });

    expect(secondUser).toBeNull();

    // The second challenge must not have been persisted either.
    const secondChallengeCount = await prisma.emailVerificationChallenge.count({
      where: {
        email: secondEmail,
      },
    });

    expect(secondChallengeCount).toBe(0);
  });
});
