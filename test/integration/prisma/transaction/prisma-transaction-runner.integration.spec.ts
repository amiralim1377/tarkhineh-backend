import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../../src/prisma/prisma.service.js';
import { PrismaTransactionRunner } from '../../../../src/prisma/transaction/prisma-transaction-runner.js';
import { PrismaTransactionContext } from '../../../../src/prisma/transaction/prisma-transaction-context.js';
import type { TransactionContext } from '../../../../src/shared/application/ports/transaction-runner.port.js';

// ============================================================
// TEST DATABASE SAFETY
// ============================================================

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run TransactionRunner integration tests from an unexpected database URL',
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
const transactionRunner = new PrismaTransactionRunner(prisma);

// ============================================================
// TEST HELPERS
// ============================================================

const testEmails = new Set<string>();

function createTestEmail(): string {
  const email = `transaction-runner-${randomUUID()}@example.com`;

  testEmails.add(email);

  return email;
}

function getTransactionClient(context: TransactionContext) {
  if (!(context instanceof PrismaTransactionContext)) {
    throw new Error('Expected a PrismaTransactionContext.');
  }

  return context.getClient();
}

// ============================================================
// TEST SUITE
// ============================================================

describe('PrismaTransactionRunner Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (testEmails.size === 0) {
      return;
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [...testEmails],
        },
      },
    });

    testEmails.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------
  // COMMIT
  // ----------------------------------------------------------

  it('commits database changes and makes them visible after the transaction', async () => {
    const email = createTestEmail();

    const createdUserId = await transactionRunner.execute(async (context) => {
      const tx = getTransactionClient(context);

      const user = await tx.user.create({
        data: {
          email,
          displayName: 'Transaction Runner Integration User',
          status: 'ACTIVE',
        },
      });

      // A transaction must be able to read its own writes.
      const persistedInsideTransaction = await tx.user.findUnique({
        where: { email },
      });

      expect(persistedInsideTransaction?.id).toBe(user.id);

      return user.id;
    });

    // Read through PrismaService after the transaction has committed.
    const persistedOutsideTransaction = await prisma.user.findUnique({
      where: { email },
    });

    expect(persistedOutsideTransaction).not.toBeNull();
    expect(persistedOutsideTransaction?.id).toBe(createdUserId);
    expect(persistedOutsideTransaction?.email).toBe(email);
  });

  // ----------------------------------------------------------
  // ROLLBACK
  // ----------------------------------------------------------

  it('rolls back database changes when the transaction callback fails', async () => {
    const email = createTestEmail();
    const expectedError = new Error(
      'Intentional TransactionRunner integration rollback.',
    );

    await expect(
      transactionRunner.execute(async (context) => {
        const tx = getTransactionClient(context);

        await tx.user.create({
          data: {
            email,
            displayName: 'Transaction Runner Rollback User',
            status: 'ACTIVE',
          },
        });

        throw expectedError;
      }),
    ).rejects.toBe(expectedError);

    // The transaction failed, so the inserted user must not exist.
    const persistedUser = await prisma.user.findUnique({
      where: { email },
    });

    expect(persistedUser).toBeNull();
  });

  // ----------------------------------------------------------
  // ISOLATION LEVEL
  // ----------------------------------------------------------

  it('applies the requested Serializable isolation level in PostgreSQL', async () => {
    const actualIsolationLevel = await transactionRunner.execute(
      async (context) => {
        const tx = getTransactionClient(context);

        const rows = await tx.$queryRaw<
          Array<{ transaction_isolation: string }>
        >`SHOW transaction_isolation`;

        return rows[0]?.transaction_isolation;
      },
      {
        isolationLevel: 'SERIALIZABLE',
      },
    );

    expect(actualIsolationLevel).toBe('serializable');
  });

  // ----------------------------------------------------------
  // TIMEOUT
  // ----------------------------------------------------------

  it('rolls back database changes when the transaction exceeds its timeout', async () => {
    const email = createTestEmail();

    await expect(
      transactionRunner.execute(
        async (context) => {
          const tx = getTransactionClient(context);

          await tx.user.create({
            data: {
              email,
              displayName: 'Transaction Runner Timeout User',
              status: 'ACTIVE',
            },
          });

          // Keep the PostgreSQL transaction open longer than timeoutMs.
          await tx.$queryRaw`SELECT pg_sleep(1)`;
        },
        {
          timeoutMs: 250,
        },
      ),
    ).rejects.toBeDefined();

    // A timed-out transaction must not leave its writes committed.
    const persistedUser = await prisma.user.findUnique({
      where: { email },
    });

    expect(persistedUser).toBeNull();
  }, 10_000);
});
