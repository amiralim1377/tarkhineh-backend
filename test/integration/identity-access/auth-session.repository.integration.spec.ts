import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AuthSession } from '../../../src/contexts/identity-access/domain/entities/auth-session.js';
import type {
  CreateAuthSessionInput,
  RotateRefreshTokenInput,
} from '../../../src/contexts/identity-access/domain/ports/auth-session.repository.js';
import { PrismaAuthSessionRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-auth-session.repository.js';
import { SecureRefreshTokenFactory } from '../../../src/contexts/identity-access/infrastructure/security/secure-refresh-token.factory.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run auth-session integration tests from an unexpected database URL',
    );
  }

  url.pathname = '/tarkhineh_test';
  return url.toString();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
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
const repository = new PrismaAuthSessionRepository(prisma);
const tokenFactory = new SecureRefreshTokenFactory();
const testEmails: string[] = [];

async function createActiveSession() {
  const now = new Date();
  const email = `auth-session-${randomUUID()}@example.com`;

  testEmails.push(email);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'integration-test-password-hash',
      displayName: 'Auth Session Integration User',
      status: 'ACTIVE',
      emailVerifiedAt: now,
    },
    select: { id: true },
  });

  const initialToken = tokenFactory.create();
  const initialCsrfToken = tokenFactory.create();

  const session = AuthSession.create({
    userId: user.id,
    createdAt: now,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
  });

  const sessionInput: CreateAuthSessionInput = {
    session,
    initialRefreshTokenHash: initialToken.tokenHash,
    csrfTokenHash: initialCsrfToken.tokenHash,
    refreshTokenExpiresAt: session.calculateRefreshTokenExpiresAt(
      now,
      REFRESH_TOKEN_TTL_SECONDS,
    ),
  };

  const createdSession = await repository.createSession(sessionInput);

  return {
    userId: user.id,
    sessionId: createdSession.sessionId,
    sessionExpiresAt: createdSession.sessionExpiresAt,
    refreshTokenExpiresAt: createdSession.refreshTokenExpiresAt,
    initialToken,
    initialCsrfToken,
    now,
  };
}

function createRotationInput(
  currentTokenHash: string,
  currentCsrfTokenHash: string,
  replacementTokenHash: string,
  replacementCsrfTokenHash: string,
  now: Date,
): RotateRefreshTokenInput {
  return {
    currentTokenHash,
    currentCsrfTokenHash,
    replacementTokenHash,
    replacementCsrfTokenHash,
    now,
    replacementRefreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
  };
}

describe('PrismaAuthSessionRepository integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (testEmails.length === 0) {
      return;
    }

    await prisma.user.deleteMany({
      where: { email: { in: [...testEmails] } },
    });

    testEmails.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists a session and only the refresh-token hash', async () => {
    const {
      userId,
      sessionId,
      sessionExpiresAt,
      initialToken,
      initialCsrfToken,
    } = await createActiveSession();

    const persisted = await prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { refreshTokens: true },
    });

    expect(persisted).not.toBeNull();

    if (!persisted) {
      throw new Error('Expected the session to be persisted');
    }

    expect(persisted.userId).toBe(userId);
    expect(persisted.revokedAt).toBeNull();
    expect(persisted.expiresAt).toEqual(sessionExpiresAt);
    expect(persisted.refreshTokens).toHaveLength(1);

    const storedToken = persisted.refreshTokens[0];

    expect(storedToken).toBeDefined();
    expect(storedToken.tokenHash).toBe(initialToken.tokenHash);
    expect(storedToken.tokenHash).not.toBe(initialToken.token);
    expect(storedToken.csrfTokenHash).toBe(initialCsrfToken.tokenHash);
    expect(storedToken.csrfTokenHash).not.toBe(initialCsrfToken.token);
    expect(storedToken.usedAt).toBeNull();
    expect(storedToken.revokedAt).toBeNull();
  });

  it('rotates a token and persists its replacement link', async () => {
    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    const replacementToken = tokenFactory.create();
    const replacementCsrfToken = tokenFactory.create();
    const rotationTime = new Date(now.getTime() + 1000);

    const result = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        replacementToken.tokenHash,
        replacementCsrfToken.tokenHash,
        rotationTime,
      ),
    );

    expect(result.status).toBe('ROTATED');

    const previous = await prisma.refreshToken.findUnique({
      where: { tokenHash: initialToken.tokenHash },
    });
    const replacement = await prisma.refreshToken.findUnique({
      where: { tokenHash: replacementToken.tokenHash },
    });

    expect(previous).not.toBeNull();
    expect(replacement).not.toBeNull();

    if (!previous || !replacement) {
      throw new Error('Expected both refresh-token records to exist');
    }

    expect(previous.usedAt).toEqual(rotationTime);
    expect(previous.replacedByTokenId).toBe(replacement.id);
    expect(replacement.sessionId).toBe(sessionId);
    expect(replacement.csrfTokenHash).toBe(replacementCsrfToken.tokenHash);
    expect(replacement.csrfTokenHash).not.toBe(replacementCsrfToken.token);
    expect(replacement.usedAt).toBeNull();
    expect(replacement.revokedAt).toBeNull();
  });

  it('rejects an expired token without creating a replacement', async () => {
    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    await prisma.refreshToken.update({
      where: { tokenHash: initialToken.tokenHash },
      data: { expiresAt: new Date(now.getTime() - 1000) },
    });

    const replacementToken = tokenFactory.create();
    const replacementCsrfToken = tokenFactory.create();

    const result = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        replacementToken.tokenHash,
        replacementCsrfToken.tokenHash,
        now,
      ),
    );

    expect(result).toEqual({ status: 'INVALID' });

    const replacement = await prisma.refreshToken.findUnique({
      where: { tokenHash: replacementToken.tokenHash },
    });
    const persistedSession = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });

    expect(replacement).toBeNull();
    expect(persistedSession?.revokedAt).toBeNull();
  });

  it('revokes the session if a consumed token is reused', async () => {
    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    const firstReplacement = tokenFactory.create();
    const firstReplacementCsrf = tokenFactory.create();

    const firstResult = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        firstReplacement.tokenHash,
        firstReplacementCsrf.tokenHash,
        now,
      ),
    );

    expect(firstResult.status).toBe('ROTATED');

    const reuseTime = new Date(now.getTime() + 2000);
    const unusedReplacement = tokenFactory.create();
    const unusedReplacementCsrf = tokenFactory.create();

    const reuseResult = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        unusedReplacement.tokenHash,
        unusedReplacementCsrf.tokenHash,
        reuseTime,
      ),
    );

    expect(reuseResult).toEqual({ status: 'REUSE_DETECTED' });

    const persistedSession = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    const tokens = await prisma.refreshToken.findMany({
      where: { sessionId },
    });

    expect(persistedSession?.revokedAt).toEqual(reuseTime);
    expect(persistedSession?.revocationReason).toBe('REFRESH_TOKEN_REUSE');
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('allows only one concurrent rotation and detects reuse', async () => {
    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    const firstReplacement = tokenFactory.create();
    const secondReplacement = tokenFactory.create();
    const firstReplacementCsrf = tokenFactory.create();
    const secondReplacementCsrf = tokenFactory.create();
    const rotationTime = new Date(now.getTime() + 1000);

    const results = await Promise.all([
      repository.rotateRefreshToken(
        createRotationInput(
          initialToken.tokenHash,
          initialCsrfToken.tokenHash,
          firstReplacement.tokenHash,
          firstReplacementCsrf.tokenHash,
          rotationTime,
        ),
      ),
      repository.rotateRefreshToken(
        createRotationInput(
          initialToken.tokenHash,
          initialCsrfToken.tokenHash,
          secondReplacement.tokenHash,
          secondReplacementCsrf.tokenHash,
          rotationTime,
        ),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'ROTATED'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'REUSE_DETECTED'),
    ).toHaveLength(1);

    const persistedSession = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    const tokens = await prisma.refreshToken.findMany({
      where: { sessionId },
    });

    expect(persistedSession?.revocationReason).toBe('REFRESH_TOKEN_REUSE');
    expect(persistedSession?.revokedAt).not.toBeNull();
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('revokes a session and its refresh tokens on logout', async () => {
    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    const result = await repository.revokeSessionByTokenHash(
      initialToken.tokenHash,
      initialCsrfToken.tokenHash,
      now,
    );

    expect(result).toBe(true);

    const persistedSession = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    const tokens = await prisma.refreshToken.findMany({
      where: { sessionId },
    });

    expect(persistedSession?.revocationReason).toBe('LOGOUT');
    expect(persistedSession?.revokedAt).toEqual(now);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.revokedAt).toEqual(now);
  });
});
