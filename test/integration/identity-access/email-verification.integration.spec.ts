import { createHash, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { IdentityUser } from '../../../src/contexts/identity-access/domain/entities/identity-user.js';
import { PrismaEmailRegistrationRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-registration.repository.js';
import { PrismaEmailVerificationCompletionStore } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-email-verification-completion.store.js';
import { AesGcmOutboundEmailPayloadEncryptor } from '../../../src/contexts/outbound-email/infrastructure/security/aes-gcm-outbound-email-payload-encryptor.js';
import { registerIntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';

// --------------------------------------------------
// TEST CONFIGURATION
// --------------------------------------------------

const infrastructure = registerIntegrationTestInfrastructure();

const SESSION_VERIFICATION_TTL_MS = 30 * 60 * 1000;

const testEncryptionKey = Buffer.alloc(32, 0x5a).toString('base64');

const configService = {
  getOrThrow(key: string): string {
    if (key === 'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY') {
      return testEncryptionKey;
    }

    throw new Error(`Unexpected configuration key: ${key}`);
  },
} as unknown as ConfigService;

const payloadEncryptor = new AesGcmOutboundEmailPayloadEncryptor(configService);

// --------------------------------------------------
// TEST HELPERS
// --------------------------------------------------

function createTokenHash(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

describe('Email verification (Integration)', () => {
  let prisma: PrismaClient;

  let registrationRepository: PrismaEmailRegistrationRepository;

  let verificationStore: PrismaEmailVerificationCompletionStore;

  beforeEach(() => {
    prisma = infrastructure.database.client;

    const prismaService = prisma as unknown as PrismaService;

    registrationRepository = new PrismaEmailRegistrationRepository(
      prismaService,
    );

    verificationStore = new PrismaEmailVerificationCompletionStore(
      prismaService,
      payloadEncryptor,
    );
  });

  // --------------------------------------------------
  // PENDING USER FACTORY
  // --------------------------------------------------

  async function createPendingUser(
    now: Date,
    expiresAt: Date,
  ): Promise<{ email: string; tokenHash: string }> {
    const email = `verification-${randomUUID()}@example.com`;

    const tokenHash = createTokenHash();

    const user = IdentityUser.registerPending({
      email,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Verification Integration Test',
    });

    const encryptedPayload = payloadEncryptor.encrypt(
      JSON.stringify({
        email,
        tokenHash,
      }),
    );

    const created = await registrationRepository.createPendingRegistration({
      user,
      tokenHash,
      encryptedPayload,
      now,
      expiresAt,
    });

    if (!created) {
      throw new Error('Failed to create test registration.');
    }

    // Clean outbound messages before deleting their aggregate records.
    infrastructure.cleanup.add(async () => {
      const [persistedUser, challenges] = await Promise.all([
        prisma.user.findUnique({
          where: {
            email,
          },
          select: {
            id: true,
          },
        }),

        prisma.emailVerificationChallenge.findMany({
          where: {
            email,
          },
          select: {
            id: true,
          },
        }),
      ]);

      const userIds = persistedUser ? [persistedUser.id] : [];

      const challengeIds = challenges.map((challenge) => challenge.id);

      await prisma.outboundEmailMessage.deleteMany({
        where: {
          OR: [
            {
              aggregateType: 'User',
              aggregateId: {
                in: userIds,
              },
            },
            {
              aggregateType: 'EmailVerificationChallenge',
              aggregateId: {
                in: challengeIds,
              },
            },
          ],
        },
      });

      // Email verification challenges are removed through
      // the User relation when the user is deleted.

      await prisma.user.deleteMany({
        where: {
          email,
        },
      });
    });

    return {
      email,
      tokenHash,
    };
  }

  // --------------------------------------------------
  // SUCCESSFUL EMAIL VERIFICATION
  // --------------------------------------------------

  it('should activate a pending user and consume a valid token', async () => {
    // Arrange

    const now = new Date();

    const { email, tokenHash } = await createPendingUser(
      now,
      new Date(now.getTime() + SESSION_VERIFICATION_TTL_MS),
    );

    // Act

    const result = await verificationStore.completeEmailVerification({
      tokenHash,
      now,
    });

    // Assert

    expect(result).toBe(true);

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
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
      where: {
        tokenHash,
      },
      select: {
        consumedAt: true,
      },
    });

    expect(challenge?.consumedAt).toEqual(now);
  });

  // --------------------------------------------------
  // TOKEN REUSE
  // --------------------------------------------------

  it('should not allow the same token to verify twice', async () => {
    // Arrange

    const now = new Date();

    const { tokenHash } = await createPendingUser(
      now,
      new Date(now.getTime() + SESSION_VERIFICATION_TTL_MS),
    );

    // Act

    const firstResult = await verificationStore.completeEmailVerification({
      tokenHash,
      now,
    });

    const secondResult = await verificationStore.completeEmailVerification({
      tokenHash,
      now: new Date(now.getTime() + 1000),
    });

    // Assert

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
  });

  // --------------------------------------------------
  // EXPIRED TOKEN
  // --------------------------------------------------

  it('should not activate a user with an expired token', async () => {
    // Arrange

    const createdAt = new Date();

    const expiresAt = new Date(createdAt.getTime() + 60 * 1000);

    const verificationNow = new Date(createdAt.getTime() + 2 * 60 * 1000);

    const { email, tokenHash } = await createPendingUser(createdAt, expiresAt);

    // Act

    const result = await verificationStore.completeEmailVerification({
      tokenHash,
      now: verificationNow,
    });

    // Assert

    expect(result).toBe(false);

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
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

  // --------------------------------------------------
  // CONCURRENT EMAIL VERIFICATION
  // --------------------------------------------------

  it('should allow only one concurrent request to verify the same token', async () => {
    // Arrange

    const now = new Date();

    const { email, tokenHash } = await createPendingUser(
      now,
      new Date(now.getTime() + SESSION_VERIFICATION_TTL_MS),
    );

    // Act

    const results = await Promise.all([
      verificationStore.completeEmailVerification({
        tokenHash,
        now,
      }),

      verificationStore.completeEmailVerification({
        tokenHash,
        now,
      }),
    ]);

    // Assert

    expect(results.filter(Boolean)).toHaveLength(1);

    expect(results.filter((result) => !result)).toHaveLength(1);

    const challenge = await prisma.emailVerificationChallenge.findUnique({
      where: {
        tokenHash,
      },
      select: {
        consumedAt: true,
      },
    });

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
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
