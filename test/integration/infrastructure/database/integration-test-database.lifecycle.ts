import { afterAll, beforeAll } from 'vitest';
import { loadTestDatabaseConfig } from '../config/test-database.config.js';
import type { TestDatabaseConfig } from '../config/test-database.config.js';
import { IntegrationTestDatabaseManager } from './integration-test-database.manager.js';

export function registerIntegrationTestDatabaseLifecycle(
  config: TestDatabaseConfig = loadTestDatabaseConfig(),
  environment: NodeJS.ProcessEnv = process.env,
): IntegrationTestDatabaseManager {
  const databaseManager = new IntegrationTestDatabaseManager(
    config,
    environment,
  );

  beforeAll(async () => {
    await databaseManager.start();
  });

  afterAll(async () => {
    await databaseManager.stop();
  });

  return databaseManager;
}
