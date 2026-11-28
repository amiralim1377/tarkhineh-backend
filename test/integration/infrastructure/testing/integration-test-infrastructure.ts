import { afterEach } from 'vitest';
import type { TestDatabaseConfig } from '../config/test-database.config.js';
import { IntegrationTestCleanup } from './cleanup/integration-test-cleanup.js';
import { registerIntegrationTestDatabase } from './integration-test-database.js';

export function registerIntegrationTestInfrastructure(
  config?: TestDatabaseConfig,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const database = registerIntegrationTestDatabase(config, environment);
  const cleanup = new IntegrationTestCleanup();

  afterEach(async () => {
    await cleanup.clean();
  });

  return {
    database,
    cleanup,
  };
}

export type IntegrationTestInfrastructure = ReturnType<
  typeof registerIntegrationTestInfrastructure
>;
