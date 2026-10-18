import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaEmailRegistrationRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-registration.repository.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const configuredDatabase = decodeURIComponent(
    url.pathname.replace(/^\/+/, ''),
  );

  // Safety guard: never redirect this test from the expected development
  // connection to an unexpected database. The target is always tarkhineh_test.
  if (configuredDatabase !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to configure integration tests from an unexpected database URL',
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
const repository = new PrismaEmailRegistrationRepository(prisma);

const testEmails: string[] = [];

function createRegistrationInput(email: string, tokenHash: string) {
  return {
    email,
    passwordHash: 'integration-test-password-hash',
    displayName: 'Integration Test User',
    tokenHash,
    encryptedToken: 'v1:integration-test-encrypted-payload',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };
}

function createTestEmail(): string {
  const email = `integration-${randomUUID()}@example.com`;
  testEmails.push(email);
  return email;
}

describe('PrismaEmailRegistrationRepository integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (testEmails.length === 0) {
      return;
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [...testEmails],
        },
      },
    });

    testEmails.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists the user, verification challenge and outbox message', async () => {
    const email = createTestEmail();
    const tokenHash = randomUUID();

    const result = await repository.createPendingRegistration(
      createRegistrationInput(email, tokenHash),
    );

    expect(result).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        emailVerificationChallenges: {
          include: {
            outboxMessage: true,
          },
        },
      },
    });

    expect(user).not.toBeNull();

    if (!user) {
      throw new Error('Expected the test user to exist');
    }

    expect(user.status).toBe('PENDING');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toBe('integration-test-password-hash');
    expect(user.emailVerificationChallenges).toHaveLength(1);

    const challenge = user.emailVerificationChallenges[0];

    expect(challenge.tokenHash).toBe(tokenHash);
    expect(challenge.consumedAt).toBeNull();

    expect(challenge.outboxMessage).not.toBeNull();

    if (!challenge.outboxMessage) {
      throw new Error('Expected an outbox message for the challenge');
    }

    expect(challenge.outboxMessage).toMatchObject({
      challengeId: challenge.id,
      encryptedToken: 'v1:integration-test-encrypted-payload',
      status: 'PENDING',
      attempts: 0,
    });
  });

  it('rolls back user creation when challenge creation fails', async () => {
    const firstEmail = createTestEmail();
    const secondEmail = createTestEmail();
    const duplicateTokenHash = randomUUID();

    const firstResult = await repository.createPendingRegistration(
      createRegistrationInput(firstEmail, duplicateTokenHash),
    );

    expect(firstResult).toBe(true);

    await expect(
      repository.createPendingRegistration(
        createRegistrationInput(secondEmail, duplicateTokenHash),
      ),
    ).rejects.toThrow();

    const secondUser = await prisma.user.findUnique({
      where: { email: secondEmail },
      select: { id: true },
    });

    expect(secondUser).toBeNull();

    const secondChallengeCount = await prisma.emailVerificationChallenge.count({
      where: {
        email: secondEmail,
      },
    });

    expect(secondChallengeCount).toBe(0);

    const secondOutboxCount = await prisma.emailOutboxMessage.count({
      where: {
        challenge: {
          email: secondEmail,
        },
      },
    });

    expect(secondOutboxCount).toBe(0);
  });
});
