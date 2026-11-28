import { beforeEach, describe, it } from 'vitest';

import { PrismaMenuCategoryRepository } from '../../../src/contexts/menu/infrastructure/persistence/prisma-menu-category.repository.js';

import { registerIntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';
import { registerMenuIntegrationTestContext } from './menu-integration-test-context.js';
import { MenuCategory } from '../../../src/contexts/menu/domain/entities/menu-category.js';
import { input } from 'zod';
import { normalizePrismaError } from '../../../src/prisma/errors/prisma-error-translator.js';

const infrastructure = registerIntegrationTestInfrastructure();
const menuContext = registerMenuIntegrationTestContext(infrastructure);

describe('PrismaMenuCategoryRepository (Integration)', () => {
  let repository: PrismaMenuCategoryRepository;

  beforeEach(() => {
    repository = new PrismaMenuCategoryRepository(
      infrastructure.database.client,
    );
  });

  // --------------------------------------------------
  // findById
  // --------------------------------------------------

  describe('findById', () => {
    it('should return a menu category when it exists', async () => {
      // arrange
      //fixture
      const { organization } = await menuContext.factories.fixture.create();
      // use factory
      const category = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      //   act
      const actual = await repository.findById(organization.id, category.id);

      //   assert
      expect(actual).not.toBeNull();
      expect(actual?.id).toBe(category.id);
      expect(actual?.organizationId).toBe(organization.id);
      expect(actual?.nameFa).toBe('کباب');
      expect(actual?.nameEn).toBe('Kebab');
      expect(actual?.descriptionFa).toBe('انواع کباب');
      expect(actual?.displayOrder).toBe(1);
      expect(actual).toBeInstanceOf(MenuCategory);
    });

    it('should return null when the menu category does not exist', async () => {
      // arrange

      const { organization } = await menuContext.factories.fixture.create();

      const nonExistingCategoryId = 'non-existing-id';

      //   act
      const actual = await repository.findById(
        organization.id,
        nonExistingCategoryId,
      );

      //   assert
      expect(actual).toBeNull();
    });

    it('should not return a category belonging to another organization', async () => {
      // arrange
      const { organization } = await menuContext.factories.fixture.create();
      const { organization: otherOrganization } =
        await menuContext.factories.fixture.create();
      const category = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      //   act
      const actual = await repository.findById(
        otherOrganization.id,
        category.id,
      );

      //   assert
      expect(actual).toBeNull();
    });
  });

  // --------------------------------------------------
  // findByIds
  // --------------------------------------------------

  describe('findByIds', () => {
    it('should return an empty array when category IDs are empty', async () => {
      const { organization } = await menuContext.factories.fixture.create();
      const categoryIds = [] as const;

      //   act
      const actual = await repository.findByIds(organization.id, categoryIds);

      //   assert
      expect(actual).toEqual([]);
    });

    it('should return all matching categories', async () => {
      // arrange
      const { organization } = await menuContext.factories.fixture.create();
      const kebabCat = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });
      const pizzaCat = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'pizza',
        descriptionFa: 'انواع پیتزا',
        displayOrder: 2,
      });

      //   act
      const actual = await repository.findByIds(organization.id, [
        pizzaCat.id,
        kebabCat.id,
      ]);

      //   assert
      expect(actual).toHaveLength(2);
      expect(actual.map((cat) => cat.id)).toEqual(
        expect.arrayContaining([kebabCat.id, pizzaCat.id]),
      );

      expect(actual).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: kebabCat.id,
            nameFa: 'کباب',
            nameEn: 'Kebab',
          }),
          expect.objectContaining({
            id: pizzaCat.id,
            nameFa: 'پیتزا',
            nameEn: 'pizza',
          }),
        ]),
      );
    });

    it('should return only categories belonging to the specified organization', async () => {
      // arrange
      const { organization: firstOrg } =
        await menuContext.factories.fixture.create();

      const { organization: secondOrg } =
        await menuContext.factories.fixture.create();

      const kebabCat = await menuContext.factories.category.create({
        organizationId: firstOrg.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      const pizzaCat = await menuContext.factories.category.create({
        organizationId: secondOrg.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        displayOrder: 2,
      });

      // act
      const actual = await repository.findByIds(firstOrg.id, [
        kebabCat.id,
        pizzaCat.id,
      ]);

      //   assert
      expect(actual).toHaveLength(1);
      expect(actual[0].id).toBe(kebabCat.id);
      expect(actual[0].organizationId).toBe(firstOrg.id);
    });

    it('should ignore category IDs that do not exist', async () => {
      const { organization } = await menuContext.factories.fixture.create();
      const kebabCat = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      const pizzaCat = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        displayOrder: 2,
      });
      const burgerCat = { id: 'fake-id' };

      //   act
      const actual = await repository.findByIds(organization.id, [
        kebabCat.id,
        pizzaCat.id,
        burgerCat.id,
      ]);

      //   assert
      expect(actual).toHaveLength(2);
    });
  });

  // --------------------------------------------------
  // save
  // --------------------------------------------------

  describe('save', () => {
    it('should persist a menu category in the database', async () => {
      const { organization } = await menuContext.factories.fixture.create();
      const menuCategory = MenuCategory.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        descriptionEn: 'just a pizza',
        displayOrder: 2,
      });

      //   act
      await repository.save(menuCategory);

      //   assert
      const actual =
        await infrastructure.database.client.menuCategory.findUnique({
          where: {
            id_organizationId: {
              id: menuCategory.id,
              organizationId: organization.id,
            },
          },
        });

      expect(actual).not.toBeNull();
      expect(actual?.id).toBe(menuCategory.id);
      expect(actual?.nameFa).toBe('پیتزا');
      expect(actual?.nameEn).toBe('Pizza');
      expect(actual?.descriptionFa).toBe('انواع پیتزا');
    });

    it('should persist all menu category properties correctly', async () => {
      //   arrange
      const { organization } = await menuContext.factories.fixture.create();
      const menuCategory = MenuCategory.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        descriptionEn: 'just a pizza',
        displayOrder: 2,
      });

      //   act
      await repository.save(menuCategory);
      const actual =
        await infrastructure.database.client.menuCategory.findUnique({
          where: {
            id_organizationId: {
              id: menuCategory.id,
              organizationId: organization.id,
            },
          },
        });

      //   assert
      expect(actual?.displayOrder).toBe(2);
      expect(actual).not.toBeNull();

      expect(actual).toMatchObject({
        id: menuCategory.id,
        organizationId: organization.id,
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        descriptionEn: 'just a pizza',
        displayOrder: 2,
        imageId: null,
        status: menuCategory.status,
        createdAt: menuCategory.createdAt,
        updatedAt: menuCategory.updatedAt,
      });
    });
  });

  // --------------------------------------------------
  // update
  // --------------------------------------------------

  describe('update', () => {
    it('should update an existing menu category', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const createdCategory = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      const category = await repository.findById(
        organization.id,
        createdCategory.id,
      );

      expect(category).not.toBeNull();

      if (!category) {
        throw new Error('Menu category was not found.');
      }

      category.update({
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
      });

      // Act

      await repository.update(category);

      // Assert

      const actual =
        await infrastructure.database.client.menuCategory.findUnique({
          where: {
            id_organizationId: {
              id: createdCategory.id,
              organizationId: organization.id,
            },
          },
        });

      expect(actual).not.toBeNull();
      expect(actual?.nameFa).toBe('پیتزا');
      expect(actual?.nameEn).toBe('Pizza');
    });

    it('should persist all updated properties correctly', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const createdCategory = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        descriptionEn: 'Different kinds of kebab',
        displayOrder: 1,
      });

      const category = await repository.findById(
        organization.id,
        createdCategory.id,
      );

      expect(category).not.toBeNull();

      if (!category) {
        throw new Error('Menu category was not found.');
      }

      category.update({
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        descriptionEn: 'Different kinds of pizza',
        imageId: 'updated-image-id',
        displayOrder: 5,
      });

      category.deactivate();

      // Act

      await repository.update(category);

      // Assert

      const actual =
        await infrastructure.database.client.menuCategory.findUnique({
          where: {
            id_organizationId: {
              id: createdCategory.id,
              organizationId: organization.id,
            },
          },
        });

      expect(actual).not.toBeNull();

      expect(actual).toMatchObject({
        nameFa: 'پیتزا',
        nameEn: 'Pizza',
        descriptionFa: 'انواع پیتزا',
        descriptionEn: 'Different kinds of pizza',
        imageId: 'updated-image-id',
        displayOrder: 5,
        status: 'INACTIVE',
        updatedAt: category.updatedAt,
      });
    });

    it('should not modify the category identity or organization ownership', async () => {
      // Arrange

      const { organization: firstOrganization } =
        await menuContext.factories.fixture.create();

      const { organization: secondOrganization } =
        await menuContext.factories.fixture.create();

      const createdCategory = await menuContext.factories.category.create({
        organizationId: firstOrganization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      const category = await repository.findById(
        firstOrganization.id,
        createdCategory.id,
      );

      expect(category).not.toBeNull();

      if (!category) {
        throw new Error('Menu category was not found.');
      }

      category.update({
        nameFa: 'کباب ویژه',
      });

      // Act

      await repository.update(category);

      // Assert

      const actual =
        await infrastructure.database.client.menuCategory.findUnique({
          where: {
            id_organizationId: {
              id: createdCategory.id,
              organizationId: firstOrganization.id,
            },
          },
        });

      const categoryUnderOtherOrganization =
        await infrastructure.database.client.menuCategory.findUnique({
          where: {
            id_organizationId: {
              id: createdCategory.id,
              organizationId: secondOrganization.id,
            },
          },
        });

      expect(actual).not.toBeNull();
      expect(actual?.id).toBe(createdCategory.id);
      expect(actual?.organizationId).toBe(firstOrganization.id);

      expect(categoryUnderOtherOrganization).toBeNull();
    });
    it('should throw an error when updating a non-existing menu category', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const menuCategory = await menuContext.factories.category.create({
        organizationId: organization.id,
        nameFa: 'کباب',
        nameEn: 'Kebab',
        descriptionFa: 'انواع کباب',
        displayOrder: 1,
      });

      const menuCat = await repository.findById(
        organization.id,
        menuCategory.id,
      );

      expect(menuCat).not.toBeNull();

      if (!menuCat) {
        throw new Error('Menu category was not found.');
      }

      // Delete the database record
      await infrastructure.database.client.menuCategory.delete({
        where: {
          id_organizationId: {
            id: menuCategory.id,
            organizationId: organization.id,
          },
        },
      });

      // Act & Assert

      await expect(repository.update(menuCat)).rejects.toThrow();
    });
  });
});
