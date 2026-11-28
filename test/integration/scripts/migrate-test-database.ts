import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

import { loadTestDatabaseConfig } from '../infrastructure/config/test-database.config.js';
import { TestDatabaseGuard } from '../infrastructure/database/test-database.guard.js';

async function migrateTestDatabase(): Promise<void> {
  const environmentFile = resolve(process.cwd(), '.env.test');

  const result = loadEnv({
    path: environmentFile,
  });

  if (result.error && result.error.code !== 'ENOENT') {
    throw new Error(
      'Failed to load integration test environment configuration.',
    );
  }

  const databaseConfig = loadTestDatabaseConfig();

  const databaseGuard = new TestDatabaseGuard(databaseConfig);

  await databaseGuard.verify();

  const migration = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseConfig.connectionString,
    },
  });

  if (migration.error) {
    throw new Error('Failed to execute Prisma migrations.');
  }

  if (migration.status !== 0) {
    throw new Error(
      `Prisma migration failed with exit code: ${migration.status ?? 'unknown'}`,
    );
  }
}

migrateTestDatabase().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Unexpected test database migration error.',
  );

  process.exitCode = 1;
});
