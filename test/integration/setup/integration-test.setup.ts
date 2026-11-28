import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

import { loadTestDatabaseConfig } from '../infrastructure/config/test-database.config.js';
import { TestDatabaseGuard } from '../infrastructure/database/test-database.guard.js';

async function setupIntegrationTestEnvironment(): Promise<void> {
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

  process.env.DATABASE_URL = databaseConfig.connectionString;
}

await setupIntegrationTestEnvironment();
