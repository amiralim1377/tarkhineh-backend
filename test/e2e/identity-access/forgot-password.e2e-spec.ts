import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { Argon2PasswordHasher } from '../../../src/contexts/identity-access/infrastructure/security/argon2-password-hasher.js';

const originalDatabaseUrl = process.env.DATABASE_URL;

function createTestDatabaseUrl(configuredUrl: string | undefined): string {
  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for E2E tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName === 'tarkhineh_test') {
    return url.toString();
  }

  if (databaseName !== 'tarkhineh_db') {
    throw new Error('Refusing to run E2E tests against an unexpected database');
  }

  url.pathname = '/tarkhineh_test';
  return url.toString();
}

function restoreEnvironmentVariable(
  name: string,
  originalValue: string | undefined,
): void {
  if (originalValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = originalValue;
  }
}

describe('Forgot password flow (E2E)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;

  const testEmails = new Set<string>();

  beforeAll(async () => {
    process.env.DATABASE_URL = createTestDatabaseUrl(originalDatabaseUrl);

    // Mock OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY if not already set
    if (!process.env.OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY) {
      process.env.OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY = Buffer.alloc(
        32,
        'a',
      ).toString('base64');
    }

    const { AppModule } = await import('../../../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    if (testEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...testEmails] } },
      });
      testEmails.clear();
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    restoreEnvironmentVariable('DATABASE_URL', originalDatabaseUrl);
  });

  it('should return 200 and success message when requesting password reset for an existing user', async () => {
    // Arrange: Create an active user in the database
    const email = `test-forgot-${randomUUID()}@example.com`;
    testEmails.add(email);

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash('secure-password-123');

    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        emailVerifiedAt: new Date(), // User must be verified to login with password
        passwordHash,
        status: 'ACTIVE',
      },
    });

    // Act: Send POST request
    const response = await request(app!.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email });

    // Assert: Check API response
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message:
        'If that email address is in our database, we will send you an email to reset your password.',
    });

    // Assert: Check Database constraints
    const challenge = await prisma.passwordResetChallenge.findFirst({
      where: { userId: user.id },
    });
    expect(challenge).not.toBeNull();
    expect(challenge!.email).toBe(email);
    expect(challenge!.consumedAt).toBeNull();
    expect(challenge!.invalidatedAt).toBeNull();

    const emailMessage = await prisma.outboundEmailMessage.findFirst({
      where: {
        aggregateType: 'PasswordResetChallenge',
        aggregateId: challenge!.id,
      },
    });
    expect(emailMessage).not.toBeNull();
    expect(emailMessage!.lane).toBe('TRANSACTIONAL');
    expect(emailMessage!.status).toBe('PENDING');
  });

  it('should return the exact same 200 response when the user does not exist (Zero Enumeration)', async () => {
    const unknownEmail = `does-not-exist-${randomUUID()}@example.com`;

    const response = await request(app!.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: unknownEmail });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message:
        'If that email address is in our database, we will send you an email to reset your password.',
    });

    // Assert: No challenge should be created
    const challengeCount = await prisma.passwordResetChallenge.count({
      where: { email: unknownEmail },
    });
    expect(challengeCount).toBe(0);
  });
});
