import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { MenuItem } from '../../../src/contexts/menu/domain/entities/menu-item.js';
import { MenuCategory } from '../../../src/contexts/menu/domain/entities/menu-category.js';
import { PrismaTransactionRunner } from '../../../src/prisma/transaction/prisma-transaction-runner.js';
import { PrismaMenuItemUnitOfWork } from '../../../src/contexts/menu/infrastructure/persistence/prisma-menu-item.unit-of-work.js';
import { registerIntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { registerMenuIntegrationTestContext } from './menu-integration-test-context.js';

const infrastructure = registerIntegrationTestInfrastructure();
const menuContext = registerMenuIntegrationTestContext(infrastructure);

describe('PrismaMenuItemUnitOfWork (Integration)', () => {
  let prisma: PrismaClient;
  let unitOfWork: PrismaMenuItemUnitOfWork;

  beforeEach(() => {
    prisma = infrastructure.database.client;
    const transactionRunner = new PrismaTransactionRunner(
      prisma as unknown as PrismaService,
    );
    unitOfWork = new PrismaMenuItemUnitOfWork(transactionRunner);
  });

  // --------------------------------------------------
  // CLEANUP
  // --------------------------------------------------

  function registerCleanup(
    organizationId: string,
    menuItemId: string,
    categoryId: string,
  ): void {
    infrastructure.cleanup.add(async () => {
      await prisma.menuItemCategory.deleteMany({
        where: {
          organizationId,
          menuItemId,
        },
      });

      await prisma.menuItem.deleteMany({
        where: {
          id: menuItemId,
          organizationId,
        },
      });

      await prisma.menuCategory.deleteMany({
        where: {
          id: categoryId,
          organizationId,
        },
      });
    });
  }

  // --------------------------------------------------
  // EXECUTE
  // --------------------------------------------------

  describe('execute', () => {
    it('should commit changes when the operation succeeds', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const category = MenuCategory.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        displayOrder: 1,
      });

      const menuItem = MenuItem.create({
        organizationId: organization.id,
        nameFa: 'کباب کوبیده',
        nameEn: 'Koobideh Kebab',
        basePriceInToman: 150_000,
        categoryIds: [category.id],
      });

      registerCleanup(organization.id, menuItem.id, category.id);

      // Act

      const result = await unitOfWork.execute(async (context) => {
        await context.menuCategoryRepository.save(category);

        await context.menuItemRepository.save(menuItem);

        // Verify that both repositories can read
        // their changes inside the same transaction.

        const savedCategory = await context.menuCategoryRepository.findById(
          organization.id,
          category.id,
        );

        const savedMenuItem = await context.menuItemRepository.findById(
          organization.id,
          menuItem.id,
        );

        expect(savedCategory).not.toBeNull();
        expect(savedMenuItem).not.toBeNull();

        return {
          menuItemId: menuItem.id,
          categoryId: category.id,
        };
      });

      // Assert

      // Verify that execute returns the operation result.

      expect(result).toEqual({
        menuItemId: menuItem.id,
        categoryId: category.id,
      });

      // Verify that changes have been committed
      // and are visible outside the transaction.

      const persistedCategory = await prisma.menuCategory.findUnique({
        where: {
          id_organizationId: {
            id: category.id,
            organizationId: organization.id,
          },
        },
      });

      const persistedMenuItem = await prisma.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: menuItem.id,
            organizationId: organization.id,
          },
        },
        include: {
          menuItemCategories: {
            select: {
              categoryId: true,
            },
          },
        },
      });

      expect(persistedCategory).not.toBeNull();
      expect(persistedMenuItem).not.toBeNull();

      expect(persistedMenuItem?.menuItemCategories).toEqual([
        {
          categoryId: category.id,
        },
      ]);
    });

    it('should rollback all changes when the operation fails', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const category = MenuCategory.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        displayOrder: 1,
      });

      const menuItem = MenuItem.create({
        organizationId: organization.id,
        nameFa: 'پیتزا مخصوص',
        nameEn: 'Special Pizza',
        basePriceInToman: 250_000,
        categoryIds: [category.id],
      });

      registerCleanup(organization.id, menuItem.id, category.id);

      const operationError = new Error('Simulated operation failure.');

      // Act & Assert

      await expect(
        unitOfWork.execute(async (context) => {
          // First operation: Save category.

          await context.menuCategoryRepository.save(category);

          // Second operation: Save menu item
          // and its category association.

          await context.menuItemRepository.save(menuItem);

          // Simulate a failure after successful writes.

          throw operationError;
        }),
      ).rejects.toBe(operationError);

      // Verify that all transaction changes were rolled back.

      const persistedCategory = await prisma.menuCategory.findUnique({
        where: {
          id_organizationId: {
            id: category.id,
            organizationId: organization.id,
          },
        },
      });

      const persistedMenuItem = await prisma.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: menuItem.id,
            organizationId: organization.id,
          },
        },
      });

      const persistedAssociations = await prisma.menuItemCategory.findMany({
        where: {
          organizationId: organization.id,
          menuItemId: menuItem.id,
        },
      });

      expect(persistedCategory).toBeNull();
      expect(persistedMenuItem).toBeNull();
      expect(persistedAssociations).toHaveLength(0);
    });
  });
});
