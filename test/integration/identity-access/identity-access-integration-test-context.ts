import type { IntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { UserTestFactory } from './factories/user-test.factory.js';

export function registerIdentityAccessIntegrationTestContext(
  infrastructure: IntegrationTestInfrastructure,
) {
  let factories: { user: UserTestFactory } | null = null;

  return {
    get factories() {
      if (!factories) {
        factories = {
          user: new UserTestFactory(
            infrastructure.database.client,
            infrastructure.cleanup,
          ),
        };
      }

      return factories;
    },
  };
}
