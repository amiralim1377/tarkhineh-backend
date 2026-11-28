import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { loadTestDatabaseConfig } from '../infrastructure/config/test-database.config.js';
import { TestDatabaseGuard } from '../infrastructure/database/test-database.guard.js';

async function resetTestDatabase(): Promise<void> {
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

  console.log(`Resetting test database: ${databaseConfig.databaseName}`);

  const reset = spawnSync('npx', ['prisma', 'migrate', 'reset', '--force'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseConfig.connectionString,
    },
  });

  if (reset.error) {
    throw new Error('Failed to execute Prisma database reset.');
  }

  if (reset.status !== 0) {
    throw new Error(
      `Prisma database reset failed with exit code: ${reset.status ?? 'unknown'}`,
    );
  }

  console.log('Test database reset completed successfully.');
}

resetTestDatabase().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Unexpected test database reset error.',
  );

  process.exitCode = 1;
});
