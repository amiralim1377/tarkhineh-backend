import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { AuthSession } from '../../../src/contexts/identity-access/domain/entities/auth-session.js';
import type {
  CreateAuthSessionInput,
  RotateRefreshTokenInput,
} from '../../../src/contexts/identity-access/domain/ports/auth-session.repository.js';
import { PrismaAuthSessionRepository } from '../../../src/contexts/identity-access/infrastructure/persistence/prisma-auth-session.repository.js';
import { SecureRefreshTokenFactory } from '../../../src/contexts/identity-access/infrastructure/security/secure-refresh-token.factory.js';
import { registerIntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { registerIdentityAccessIntegrationTestContext } from './identity-access-integration-test-context.js';

const infrastructure = registerIntegrationTestInfrastructure();
const identityAccess =
  registerIdentityAccessIntegrationTestContext(infrastructure);

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

describe('PrismaAuthSessionRepository (Integration)', () => {
  let prisma: PrismaClient;
  let repository: PrismaAuthSessionRepository;

  const tokenFactory = new SecureRefreshTokenFactory();

  beforeEach(() => {
    prisma = infrastructure.database.client;

    repository = new PrismaAuthSessionRepository(
      prisma as unknown as PrismaService,
    );
  });

  // --------------------------------------------------
  // TEST HELPERS
  // --------------------------------------------------

  async function createActiveSession() {
    const now = new Date();

    // Create a user using the Identity Access factory.

    const user = await identityAccess.factories.user.create();

    // The rotation logic requires an active and verified user.

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        emailVerifiedAt: now,
      },
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

    // UserTestFactory registered user cleanup first.
    // Cleanup runs in reverse order, so session cleanup runs
    // before user cleanup.

    infrastructure.cleanup.add(async () => {
      await prisma.refreshToken.deleteMany({
        where: {
          sessionId: createdSession.sessionId,
        },
      });

      await prisma.authSession.deleteMany({
        where: {
          id: createdSession.sessionId,
        },
      });
    });

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

  // --------------------------------------------------
  // CREATE SESSION
  // --------------------------------------------------

  it('should persist a session and only the refresh-token hash', async () => {
    // Arrange

    const {
      userId,
      sessionId,
      sessionExpiresAt,
      initialToken,
      initialCsrfToken,
    } = await createActiveSession();

    // Act

    const persisted = await prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        refreshTokens: true,
      },
    });

    // Assert

    expect(persisted).not.toBeNull();

    if (!persisted) {
      throw new Error('Expected the session to be persisted.');
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

  // --------------------------------------------------
  // REFRESH TOKEN ROTATION
  // --------------------------------------------------

  it('should rotate a token and persist its replacement link', async () => {
    // Arrange

    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    const replacementToken = tokenFactory.create();

    const replacementCsrfToken = tokenFactory.create();

    const rotationTime = new Date(now.getTime() + 1000);

    // Act

    const result = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        replacementToken.tokenHash,
        replacementCsrfToken.tokenHash,
        rotationTime,
      ),
    );

    // Assert

    expect(result.status).toBe('ROTATED');

    const previous = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: initialToken.tokenHash,
      },
    });

    const replacement = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: replacementToken.tokenHash,
      },
    });

    expect(previous).not.toBeNull();
    expect(replacement).not.toBeNull();

    if (!previous || !replacement) {
      throw new Error('Expected both refresh-token records to exist.');
    }

    expect(previous.usedAt).toEqual(rotationTime);

    expect(previous.replacedByTokenId).toBe(replacement.id);

    expect(replacement.sessionId).toBe(sessionId);

    expect(replacement.csrfTokenHash).toBe(replacementCsrfToken.tokenHash);

    expect(replacement.csrfTokenHash).not.toBe(replacementCsrfToken.token);

    expect(replacement.usedAt).toBeNull();
    expect(replacement.revokedAt).toBeNull();
  });

  // --------------------------------------------------
  // EXPIRED REFRESH TOKEN
  // --------------------------------------------------

  it('should reject an expired token without creating a replacement', async () => {
    // Arrange

    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    await prisma.refreshToken.update({
      where: {
        tokenHash: initialToken.tokenHash,
      },
      data: {
        expiresAt: new Date(now.getTime() - 1000),
      },
    });

    const replacementToken = tokenFactory.create();

    const replacementCsrfToken = tokenFactory.create();

    // Act

    const result = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        replacementToken.tokenHash,
        replacementCsrfToken.tokenHash,
        now,
      ),
    );

    // Assert

    expect(result).toEqual({
      status: 'INVALID',
    });

    const replacement = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: replacementToken.tokenHash,
      },
    });

    const persistedSession = await prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    expect(replacement).toBeNull();
    expect(persistedSession?.revokedAt).toBeNull();
  });

  // --------------------------------------------------
  // REFRESH TOKEN REUSE DETECTION
  // --------------------------------------------------

  it('should revoke the session if a consumed token is reused', async () => {
    // Arrange

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

    // Act

    const reuseResult = await repository.rotateRefreshToken(
      createRotationInput(
        initialToken.tokenHash,
        initialCsrfToken.tokenHash,
        unusedReplacement.tokenHash,
        unusedReplacementCsrf.tokenHash,
        reuseTime,
      ),
    );

    // Assert

    expect(reuseResult).toEqual({
      status: 'REUSE_DETECTED',
    });

    const persistedSession = await prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    const tokens = await prisma.refreshToken.findMany({
      where: {
        sessionId,
      },
    });

    expect(persistedSession?.revokedAt).toEqual(reuseTime);

    expect(persistedSession?.revocationReason).toBe('REFRESH_TOKEN_REUSE');

    expect(tokens).toHaveLength(2);

    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  // --------------------------------------------------
  // CONCURRENT TOKEN ROTATION
  // --------------------------------------------------

  it('should allow only one concurrent rotation and detect reuse', async () => {
    // Arrange

    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    const firstReplacement = tokenFactory.create();

    const secondReplacement = tokenFactory.create();

    const firstReplacementCsrf = tokenFactory.create();

    const secondReplacementCsrf = tokenFactory.create();

    const rotationTime = new Date(now.getTime() + 1000);

    // Act

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

    // Assert

    expect(
      results.filter((result) => result.status === 'ROTATED'),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === 'REUSE_DETECTED'),
    ).toHaveLength(1);

    const persistedSession = await prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    const tokens = await prisma.refreshToken.findMany({
      where: {
        sessionId,
      },
    });

    expect(persistedSession?.revocationReason).toBe('REFRESH_TOKEN_REUSE');

    expect(persistedSession?.revokedAt).not.toBeNull();

    expect(tokens).toHaveLength(2);

    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  // --------------------------------------------------
  // LOGOUT / SESSION REVOCATION
  // --------------------------------------------------

  it('should revoke a session and its refresh tokens on logout', async () => {
    // Arrange

    const { sessionId, initialToken, initialCsrfToken, now } =
      await createActiveSession();

    // Act

    const result = await repository.revokeSessionByTokenHash(
      initialToken.tokenHash,
      initialCsrfToken.tokenHash,
      now,
    );

    // Assert

    expect(result).toBe(true);

    const persistedSession = await prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    const tokens = await prisma.refreshToken.findMany({
      where: {
        sessionId,
      },
    });

    expect(persistedSession?.revocationReason).toBe('LOGOUT');

    expect(persistedSession?.revokedAt).toEqual(now);

    expect(tokens).toHaveLength(1);

    expect(tokens[0]?.revokedAt).toEqual(now);
  });
});
