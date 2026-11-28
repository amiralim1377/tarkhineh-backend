import { describe, expect, it } from 'vitest';

import { registerIntegrationTestContext } from './integration-test-context.js';

const testContext = registerIntegrationTestContext();

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
});
