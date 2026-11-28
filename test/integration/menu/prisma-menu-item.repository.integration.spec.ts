import { beforeEach, describe, expect, it } from 'vitest';
import { MenuItem } from '../../../src/contexts/menu/domain/entities/menu-item.js';
import { PrismaMenuItemRepository } from '../../../src/contexts/menu/infrastructure/persistence/prisma-menu-item.repository.js';
import { registerIntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { registerMenuIntegrationTestContext } from './menu-integration-test-context.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';

const infrastructure = registerIntegrationTestInfrastructure();
const menuContext = registerMenuIntegrationTestContext(infrastructure);

describe('PrismaMenuItemRepository (Integration)', () => {
  let repository: PrismaMenuItemRepository;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = infrastructure.database.client;

    repository = new PrismaMenuItemRepository(prisma);
  });

  // ------------------------------------------
  // findById
  // ------------------------------------------

  describe('findById', () => {
    it('should return a menu item when it exists', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const createdItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب کوبیده',
        nameEn: 'Koobideh Kebab',
        basePrice: 150_000n,
      });

      // Act

      const actual = await repository.findById(organization.id, createdItem.id);

      // Assert

      expect(actual).not.toBeNull();
      expect(actual).toBeInstanceOf(MenuItem);

      expect(actual?.id).toBe(createdItem.id);
      expect(actual?.organizationId).toBe(organization.id);
      expect(actual?.nameFa).toBe('کباب کوبیده');
      expect(actual?.nameEn).toBe('Koobideh Kebab');
      expect(actual?.basePrice.value).toBe(150_000);
      expect(actual?.status).toBe('DRAFT');
      expect(actual?.categoryIds).toEqual([]);
    });

    it('should return null when the menu item does not exist', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const nonExistingItemId = 'non-existing-menu-item-id';

      // Act

      const actual = await repository.findById(
        organization.id,
        nonExistingItemId,
      );

      // Assert

      expect(actual).toBeNull();
    });

    it('should not return a menu item belonging to another organization', async () => {
      // Arrange

      const { organization: firstOrganization } =
        await menuContext.factories.fixture.create();

      const { organization: secondOrganization } =
        await menuContext.factories.fixture.create();

      const createdItem = await menuContext.factories.item.create({
        organizationId: firstOrganization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        basePrice: 150_000n,
      });

      // Act

      const actual = await repository.findById(
        secondOrganization.id,
        createdItem.id,
      );

      // Assert

      expect(actual).toBeNull();
    });

    it('should return the associated category IDs', async () => {
      // arrange
      const { organization } = await menuContext.factories.fixture.create();
      const kebabCat = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'دسته بندی کباب ها',
      });
      const bestSellerCat = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'دسته بندی پرفروش ها',
      });
      const kebabItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        basePrice: 150_000n,
      });

      await menuContext.factories.itemCategory.create({
        organizationId: organization.id,
        menuItemId: kebabItem.id,
        categoryId: kebabCat.id,
      });
      await menuContext.factories.itemCategory.create({
        organizationId: organization.id,
        menuItemId: kebabItem.id,
        categoryId: bestSellerCat.id,
      });

      //   act
      const actual = await repository.findById(organization.id, kebabItem.id);

      //assert
      expect(actual?.categoryIds).toHaveLength(2);

      expect(actual?.categoryIds).toEqual(
        expect.arrayContaining([kebabCat.id, bestSellerCat.id]),
      );
    });
  });

  // ------------------------------------------
  // save
  // ------------------------------------------

  describe('save', () => {
    it('should persist a menu item without categories', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const menuItem = MenuItem.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        basePriceInToman: 250_000,
      });

      // Register cleanup before saving.
      infrastructure.cleanup.add(async () => {
        await prisma.menuItem.deleteMany({
          where: {
            id: menuItem.id,
            organizationId: organization.id,
          },
        });
      });

      // Act

      await repository.save(menuItem);

      const actual = await prisma.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: menuItem.id,
            organizationId: organization.id,
          },
        },
      });

      // Assert

      expect(actual).not.toBeNull();
      expect(actual?.id).toBe(menuItem.id);
      expect(actual?.organizationId).toBe(organization.id);
      expect(actual?.nameFa).toBe('پیتزا');
      expect(actual?.basePrice).toBe(250_000n);

      const associations = await prisma.menuItemCategory.findMany({
        where: {
          organizationId: organization.id,
          menuItemId: menuItem.id,
        },
      });

      expect(associations).toHaveLength(0);
    });

    it('should persist a menu item with its category associations', async () => {
      const { organization } = await menuContext.factories.fixture.create();
      const kebabCat = await menuContext.factories.category.create({
        organizationId: organization.id,
      });

      const kebabItem = MenuItem.create({
        basePriceInToman: 1000,
        organizationId: organization.id,
        nameFa: 'کباب200گرمی',
        categoryIds: [kebabCat?.id],
      });

      //   act
      await repository.save(kebabItem);

      const item =
        await infrastructure.database.client.menuItemCategory.findUnique({
          where: {
            menuItemId_categoryId: {
              categoryId: kebabCat.id,
              menuItemId: kebabItem.id,
            },
          },
        });

      //   assert
      expect(item?.categoryId).toBe(kebabCat.id);
      expect(item).not.toBeNull();

      expect(item).toMatchObject({
        organizationId: organization.id,
        menuItemId: kebabItem.id,
        categoryId: kebabCat.id,
        displayOrder: 0,
      });
    });

    it('should persist all menu item properties correctly', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const menuItem = MenuItem.create({
        organizationId: organization.id,
        nameFa: 'جوجه کباب',
        nameEn: 'Chicken Kebab',
        descriptionFa: 'جوجه کباب زعفرانی',
        descriptionEn: 'Saffron chicken kebab',
        imageId: null,
        basePriceInToman: 320_000,
      });

      infrastructure.cleanup.add(async () => {
        await prisma.menuItem.deleteMany({
          where: {
            id: menuItem.id,
            organizationId: organization.id,
          },
        });
      });

      // Act

      await repository.save(menuItem);

      const actual = await prisma.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: menuItem.id,
            organizationId: organization.id,
          },
        },
      });

      // Assert

      expect(actual).not.toBeNull();

      expect(actual).toMatchObject({
        id: menuItem.id,
        organizationId: organization.id,
        nameFa: 'جوجه کباب',
        nameEn: 'Chicken Kebab',
        descriptionFa: 'جوجه کباب زعفرانی',
        descriptionEn: 'Saffron chicken kebab',
        imageId: null,
        basePrice: 320_000n,
        status: 'DRAFT',
      });
    });
  });

  // ------------------------------------------
  // update
  // ------------------------------------------

  describe('update', () => {
    it('should update an existing menu item', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const createdItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        basePrice: 150_000n,
      });

      const menuItem = await repository.findById(
        organization.id,
        createdItem.id,
      );

      expect(menuItem).not.toBeNull();

      if (!menuItem) {
        throw new Error('Menu item was not found.');
      }

      menuItem.update({
        nameFa: 'کباب ویژه',
        nameEn: 'Special Kebab',
      });

      // Act

      await repository.update(menuItem);

      const actual = await prisma.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: createdItem.id,
            organizationId: organization.id,
          },
        },
      });

      // Assert

      expect(actual).not.toBeNull();
      expect(actual?.nameFa).toBe('کباب ویژه');
      expect(actual?.nameEn).toBe('Special Kebab');
    });

    it('should persist all updated menu item properties correctly', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const createdItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        basePrice: 150_000n,
      });

      const kebabCategory = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'انواع کباب',
      });

      await menuContext.factories.itemCategory.create({
        organizationId: organization.id,
        menuItemId: createdItem.id,
        categoryId: kebabCategory.id,
      });

      // Retrieve the existing item as a Domain Entity.

      const menuItem = await repository.findById(
        organization.id,
        createdItem.id,
      );

      expect(menuItem).not.toBeNull();

      if (!menuItem) {
        throw new Error('Menu item was not found.');
      }

      // Update Domain Entity properties.

      menuItem.update({
        nameFa: 'کباب آپدیت شده',
        nameEn: 'Updated Kebab',
        descriptionFa: 'توضیحات جدید کباب',
        descriptionEn: 'Updated kebab description',
        imageId: 'updated-image-id',
      });

      menuItem.changeBasePrice(700);

      menuItem.activate();

      // Act

      await repository.update(menuItem);

      // Read directly from the database.

      const actual = await infrastructure.database.client.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: createdItem.id,
            organizationId: organization.id,
          },
        },
      });

      // Assert

      expect(actual).not.toBeNull();

      expect(actual).toMatchObject({
        id: createdItem.id,
        organizationId: organization.id,
        nameFa: 'کباب آپدیت شده',
        nameEn: 'Updated Kebab',
        descriptionFa: 'توضیحات جدید کباب',
        descriptionEn: 'Updated kebab description',
        imageId: 'updated-image-id',
        basePrice: 700n,
        status: 'ACTIVE',
        updatedAt: menuItem.updatedAt,
      });

      // CreatedAt must remain unchanged.

      expect(actual?.createdAt).toEqual(createdItem.createdAt);
    });

    it('should add newly assigned categories', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const kebabCategory = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
      });

      const bestSellerCategory = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'پرفروش‌ها',
      });

      const createdItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب کوبیده',
      });

      await menuContext.factories.itemCategory.create({
        organizationId: organization.id,
        menuItemId: createdItem.id,
        categoryId: kebabCategory.id,
      });

      const menuItem = await repository.findById(
        organization.id,
        createdItem.id,
      );

      expect(menuItem).not.toBeNull();

      if (!menuItem) {
        throw new Error('Menu item was not found.');
      }

      // Add a new category to the domain entity.

      menuItem.addCategory(bestSellerCategory.id);

      // Register cleanup for the association created by repository.update.

      infrastructure.cleanup.add(async () => {
        await prisma.menuItemCategory.deleteMany({
          where: {
            organizationId: organization.id,
            menuItemId: createdItem.id,
          },
        });
      });

      // Act

      await repository.update(menuItem);

      const actual = await prisma.menuItemCategory.findMany({
        where: {
          organizationId: organization.id,
          menuItemId: createdItem.id,
        },
      });

      // Assert

      expect(actual).toHaveLength(2);

      expect(actual.map((item) => item.categoryId)).toEqual(
        expect.arrayContaining([kebabCategory.id, bestSellerCategory.id]),
      );
    });
  });
});
