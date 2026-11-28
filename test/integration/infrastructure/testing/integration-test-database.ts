import type { TestDatabaseConfig } from '../config/test-database.config.js';
import { registerIntegrationTestDatabaseLifecycle } from '../database/integration-test-database.lifecycle.js';

export function registerIntegrationTestDatabase(
  config?: TestDatabaseConfig,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return registerIntegrationTestDatabaseLifecycle(config, environment);
}
