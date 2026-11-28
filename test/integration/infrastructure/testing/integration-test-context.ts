import type { TestDatabaseConfig } from '../config/test-database.config.js';
import { BranchMenuItemFactory } from './factories/menu/branch-menu-item.factory.js';
import { MenuCategoryFactory } from './factories/menu/menu-category.factory.js';
import { MenuItemCategoryFactory } from './factories/menu/menu-item-category.factory.js';
import { MenuItemFactory } from './factories/menu/menu-item.factory.js';
import { MenuTestContextFactory } from './factories/menu/menu-test-context.factory.js';
import { registerIntegrationTestDatabase } from './integration-test-database.js';

export function registerIntegrationTestContext(
  config?: TestDatabaseConfig,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const database = registerIntegrationTestDatabase(config, environment);

  const prisma = database.client;

  const menu = {
    context: new MenuTestContextFactory(prisma),
    category: new MenuCategoryFactory(prisma),
    item: new MenuItemFactory(prisma),
    itemCategory: new MenuItemCategoryFactory(prisma),
    branchMenuItem: new BranchMenuItemFactory(prisma),
  };

  return {
    database,
    menu,
  };
}
