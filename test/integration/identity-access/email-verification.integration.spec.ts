import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { IdentityUser } from '../../../src/contexts/identity-access/domain/entities/identity-user.js';
import { PrismaEmailRegistrationRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-registration.repository.js';
import { PrismaEmailVerificationCompletionStore } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-verification-completion.store.js';
import { AesGcmOutboundEmailPayloadEncryptor } from '../../../src/contexts/outbound-email/infrastructure/security/aes-gcm-outbound-email-payload-encryptor.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  // Integration tests must never run against the development database.
  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run integration tests against an unexpected database',
    );
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}

const testDatabaseUrl = createTestDatabaseUrl();

const testEncryptionKey = Buffer.alloc(32, 0x5a).toString('base64');

const configService = {
  getOrThrow(key: string): string {
    if (key === 'DATABASE_URL') {
      return testDatabaseUrl;
    }

    if (key === 'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY') {
      return testEncryptionKey;
    }

    throw new Error(`Unexpected configuration key: ${key}`);
  },
} as unknown as ConfigService;

const prisma = new PrismaService(configService);
const payloadEncryptor = new AesGcmOutboundEmailPayloadEncryptor(configService);

const registrationRepository = new PrismaEmailRegistrationRepository(prisma);
const verificationStore = new PrismaEmailVerificationCompletionStore(
  prisma,
  payloadEncryptor,
);

const testEmails: string[] = [];

function createTokenHash(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

async function createPendingUser(
  now: Date,
  expiresAt: Date,
): Promise<{ email: string; tokenHash: string }> {
  const email = `verification-${randomUUID()}@example.com`;
  const tokenHash = createTokenHash();

  testEmails.push(email);

  const created = await registrationRepository.createPendingRegistration({
    user: IdentityUser.registerPending({
      email,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Verification Integration Test',
    }),
    tokenHash,
    encryptedPayload: 'v1:integration-test-encrypted-payload',
    now,
    expiresAt,
  });

  if (!created) {
    throw new Error('Failed to create test registration');
  }

  return { email, tokenHash };
}

describe('Email verification with PostgreSQL', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    try {
      if (testEmails.length === 0) {
        return;
      }

      const emails = [...testEmails];

      const [users, challenges] = await Promise.all([
        prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true },
        }),
        prisma.emailVerificationChallenge.findMany({
          where: { email: { in: emails } },
          select: { id: true },
        }),
      ]);

      // OutboundEmailMessage uses aggregate IDs rather than cascading
      // foreign keys, so clean test messages before deleting the users.
      await prisma.outboundEmailMessage.deleteMany({
        where: {
          OR: [
            {
              aggregateType: 'User',
              aggregateId: { in: users.map((user) => user.id) },
            },
            {
              aggregateType: 'EmailVerificationChallenge',
              aggregateId: { in: challenges.map((challenge) => challenge.id) },
            },
          ],
        },
      });

      await prisma.user.deleteMany({
        where: { email: { in: emails } },
      });
    } finally {
      testEmails.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('activates a pending user and consumes a valid token', async () => {
    const now = new Date();

    const { email, tokenHash } = await createPendingUser(
      now,
      new Date(now.getTime() + 30 * 60 * 1000),
    );

    const result = await verificationStore.completeEmailVerification({
      tokenHash,
      now,
    });

    expect(result).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        status: true,
        emailVerifiedAt: true,
      },
    });

    expect(user).toMatchObject({
      status: 'ACTIVE',
      emailVerifiedAt: expect.any(Date),
    });

    const challenge = await prisma.emailVerificationChallenge.findUnique({
      where: { tokenHash },
      select: {
        consumedAt: true,
      },
    });

    expect(challenge?.consumedAt).toEqual(now);
  });

  it('does not allow the same token to verify twice', async () => {
    const now = new Date();

    const { tokenHash } = await createPendingUser(
      now,
      new Date(now.getTime() + 30 * 60 * 1000),
    );

    const firstResult = await verificationStore.completeEmailVerification({
      tokenHash,
      now,
    });

    const secondResult = await verificationStore.completeEmailVerification({
      tokenHash,
      now: new Date(now.getTime() + 1000),
    });

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
  });

  it('does not activate a user with an expired token', async () => {
    const createdAt = new Date();

    const expiresAt = new Date(createdAt.getTime() + 60 * 1000);

    const verificationNow = new Date(createdAt.getTime() + 2 * 60 * 1000);

    const { email, tokenHash } = await createPendingUser(createdAt, expiresAt);

    const result = await verificationStore.completeEmailVerification({
      tokenHash,
      now: verificationNow,
    });

    expect(result).toBe(false);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        status: true,
        emailVerifiedAt: true,
      },
    });

    expect(user).toEqual({
      status: 'PENDING',
      emailVerifiedAt: null,
    });
  });

  it('allows only one concurrent request to verify the same token', async () => {
    const now = new Date();

    const { email, tokenHash } = await createPendingUser(
      now,
      new Date(now.getTime() + 30 * 60 * 1000),
    );

    const results = await Promise.all([
      verificationStore.completeEmailVerification({ tokenHash, now }),
      verificationStore.completeEmailVerification({ tokenHash, now }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);

    const challenge = await prisma.emailVerificationChallenge.findUnique({
      where: { tokenHash },
      select: {
        consumedAt: true,
      },
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        status: true,
        emailVerifiedAt: true,
      },
    });

    expect(challenge?.consumedAt).not.toBeNull();

    expect(user).toMatchObject({
      status: 'ACTIVE',
      emailVerifiedAt: expect.any(Date),
    });
  });
});
