import { afterEach } from 'vitest';
import type { TestDatabaseConfig } from '../config/test-database.config.js';
import {
  BranchMenuItemFactory,
  MenuCategoryFactory,
  MenuItemCategoryFactory,
  MenuItemFactory,
  MenuTestContextFactory,
} from './factories/index.js';
import { IntegrationTestCleanup } from './cleanup/integration-test-cleanup.js';
import { registerIntegrationTestDatabase } from './integration-test-database.js';

export function registerIntegrationTestContext(
  config?: TestDatabaseConfig,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const database = registerIntegrationTestDatabase(config, environment);
  const cleanup = new IntegrationTestCleanup();

  let factories: {
    context: MenuTestContextFactory;
    category: MenuCategoryFactory;
    item: MenuItemFactory;
    itemCategory: MenuItemCategoryFactory;
    branchMenuItem: BranchMenuItemFactory;
  } | null = null;

  afterEach(async () => {
    await cleanup.clean();
  });

  return {
    database,
    cleanup,

    get menu() {
      if (!factories) {
        const prisma = database.client;

        factories = {
          context: new MenuTestContextFactory(prisma, cleanup),
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
