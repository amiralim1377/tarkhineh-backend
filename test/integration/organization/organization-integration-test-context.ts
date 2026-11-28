import type { IntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { BranchTestFactory } from './factories/branch-test.factory.js';
import { OrganizationTestFactory } from './factories/organization-test.factory.js';

export function registerOrganizationIntegrationTestContext(
  infrastructure: IntegrationTestInfrastructure,
) {
  let factories: {
    organization: OrganizationTestFactory;
    branch: BranchTestFactory;
  } | null = null;

  return {
    get factories() {
      if (!factories) {
        const prisma = infrastructure.database.client;
        const cleanup = infrastructure.cleanup;

        factories = {
          organization: new OrganizationTestFactory(prisma, cleanup),
          branch: new BranchTestFactory(prisma, cleanup),
        };
      }

      return factories;
    },
  };
}
