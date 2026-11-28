import { describe, expect, it } from 'vitest';
import { registerIntegrationTestContext } from './integration-test-context.js';

const testContext = registerIntegrationTestContext();

let automaticallyCleanedRecordIds:
  | {
      userId: string;
      organizationId: string;
      branchId: string;
      categoryId: string;
      itemId: string;
      branchMenuItemId: string;
    }
  | undefined;

describe('IntegrationTestContext', () => {
  it('should connect to the test database before accessing factories', () => {
    expect(testContext.database.isConnected).toBe(true);
  });

  it('should expose all menu factories through a single context', () => {
    const menu = testContext.menu;

    expect(menu.context).toBeDefined();
    expect(menu.category).toBeDefined();
    expect(menu.item).toBeDefined();
    expect(menu.itemCategory).toBeDefined();
    expect(menu.branchMenuItem).toBeDefined();
  });

  it('should reuse the same menu factory instances', () => {
    const first = testContext.menu;
    const second = testContext.menu;

    expect(first).toBe(second);
    expect(first.category).toBe(second.category);
    expect(first.item).toBe(second.item);
  });

  it('should create related menu test data through the context', async () => {
    const { menu } = testContext;

    const context = await menu.context.create();

    const category = await menu.category.create({
      organizationId: context.organization.id,
      nameFa: 'نوشیدنی‌ها',
    });

    const item = await menu.item.create({
      organizationId: context.organization.id,
      nameFa: 'قهوه اسپرسو',
      basePrice: 120_000n,
      status: 'ACTIVE',
    });

    const itemCategory = await menu.itemCategory.create({
      organizationId: context.organization.id,
      menuItemId: item.id,
      categoryId: category.id,
    });

    const branchMenuItem = await menu.branchMenuItem.create({
      organizationId: context.organization.id,
      branchId: context.branch.id,
      menuItemId: item.id,
      priceOverride: 130_000n,
    });

    expect(context.organization.ownerUserId).toBe(context.user.id);

    expect(category.organizationId).toBe(context.organization.id);
    expect(item.organizationId).toBe(context.organization.id);

    expect(itemCategory.menuItemId).toBe(item.id);
    expect(itemCategory.categoryId).toBe(category.id);

    expect(branchMenuItem.branchId).toBe(context.branch.id);
    expect(branchMenuItem.menuItemId).toBe(item.id);
    expect(branchMenuItem.priceOverride).toBe(130_000n);
  });

  it('should remove all created records during cleanup', async () => {
    const { menu, database } = testContext;

    const context = await menu.context.create();

    const category = await menu.category.create({
      organizationId: context.organization.id,
    });

    const item = await menu.item.create({
      organizationId: context.organization.id,
    });

    await menu.itemCategory.create({
      organizationId: context.organization.id,
      menuItemId: item.id,
      categoryId: category.id,
    });

    const branchMenuItem = await menu.branchMenuItem.create({
      organizationId: context.organization.id,
      branchId: context.branch.id,
      menuItemId: item.id,
    });

    await testContext.cleanup.clean();

    const prisma = database.client;

    const [
      branchMenuItemCount,
      itemCategoryCount,
      itemCount,
      categoryCount,
      branchCount,
      organizationCount,
      userCount,
    ] = await Promise.all([
      prisma.branchMenuItem.count({
        where: { id: branchMenuItem.id },
      }),
      prisma.menuItemCategory.count({
        where: {
          menuItemId: item.id,
          categoryId: category.id,
        },
      }),
      prisma.menuItem.count({
        where: { id: item.id },
      }),
      prisma.menuCategory.count({
        where: { id: category.id },
      }),
      prisma.branch.count({
        where: {
          id: context.branch.id,
          organizationId: context.organization.id,
        },
      }),
      prisma.organization.count({
        where: { id: context.organization.id },
      }),
      prisma.user.count({
        where: { id: context.user.id },
      }),
    ]);

    expect([
      branchMenuItemCount,
      itemCategoryCount,
      itemCount,
      categoryCount,
      branchCount,
      organizationCount,
      userCount,
    ]).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('should automatically clean up records after each test', async () => {
    const { menu } = testContext;

    const context = await menu.context.create();

    const category = await menu.category.create({
      organizationId: context.organization.id,
    });

    const item = await menu.item.create({
      organizationId: context.organization.id,
    });

    await menu.itemCategory.create({
      organizationId: context.organization.id,
      menuItemId: item.id,
      categoryId: category.id,
    });

    const branchMenuItem = await menu.branchMenuItem.create({
      organizationId: context.organization.id,
      branchId: context.branch.id,
      menuItemId: item.id,
    });

    automaticallyCleanedRecordIds = {
      userId: context.user.id,
      organizationId: context.organization.id,
      branchId: context.branch.id,
      categoryId: category.id,
      itemId: item.id,
      branchMenuItemId: branchMenuItem.id,
    };
  });

  it('should have automatically removed records created by the previous test', async () => {
    expect(automaticallyCleanedRecordIds).toBeDefined();

    const ids = automaticallyCleanedRecordIds!;

    const prisma = testContext.database.client;

    const [
      branchMenuItemCount,
      itemCount,
      categoryCount,
      branchCount,
      organizationCount,
      userCount,
    ] = await Promise.all([
      prisma.branchMenuItem.count({
        where: { id: ids.branchMenuItemId },
      }),
      prisma.menuItem.count({
        where: { id: ids.itemId },
      }),
      prisma.menuCategory.count({
        where: { id: ids.categoryId },
      }),
      prisma.branch.count({
        where: {
          id: ids.branchId,
          organizationId: ids.organizationId,
        },
      }),
      prisma.organization.count({
        where: { id: ids.organizationId },
      }),
      prisma.user.count({
        where: { id: ids.userId },
      }),
    ]);

    expect([
      branchMenuItemCount,
      itemCount,
      categoryCount,
      branchCount,
      organizationCount,
      userCount,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
