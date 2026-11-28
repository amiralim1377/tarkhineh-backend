import type { IntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { registerIdentityAccessIntegrationTestContext } from '../identity-access/identity-access-integration-test-context.js';
import { registerOrganizationIntegrationTestContext } from '../organization/organization-integration-test-context.js';
import {
  BranchMenuItemFactory,
  MenuCategoryFactory,
  MenuItemCategoryFactory,
  MenuItemFactory,
  MenuTestFixtureFactory,
} from './factories/index.js';

export function registerMenuIntegrationTestContext(
  infrastructure: IntegrationTestInfrastructure,
) {
  const identityAccess = registerIdentityAccessIntegrationTestContext(infrastructure);
  const organization = registerOrganizationIntegrationTestContext(infrastructure);

  let factories: {
    fixture: MenuTestFixtureFactory;
    category: MenuCategoryFactory;
    item: MenuItemFactory;
    itemCategory: MenuItemCategoryFactory;
    branchMenuItem: BranchMenuItemFactory;
  } | null = null;

  return {
    get factories() {
      if (!factories) {
        const prisma = infrastructure.database.client;
        const cleanup = infrastructure.cleanup;

        factories = {
          fixture: new MenuTestFixtureFactory(
            identityAccess.factories.user,
            organization.factories.organization,
            organization.factories.branch,
          ),
          category: new MenuCategoryFactory(prisma, cleanup),
          item: new MenuItemFactory(prisma, cleanup),
          itemCategory: new MenuItemCategoryFactory(prisma, cleanup),
          branchMenuItem: new BranchMenuItemFactory(prisma, cleanup),
        };
      }

      return factories;
    },
  };
}
