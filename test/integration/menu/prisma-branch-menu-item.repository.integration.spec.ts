import { beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../../src/generated/prisma/client.js';

import { BranchMenuItem } from '../../../src/contexts/menu/domain/entities/branch-menu-item.js';

import { PrismaBranchMenuItemRepository } from '../../../src/contexts/menu/infrastructure/persistence/prisma-branch-menu-item.repository.js';

import { registerIntegrationTestInfrastructure } from '../infrastructure/testing/integration-test-infrastructure.js';

import { registerMenuIntegrationTestContext } from './menu-integration-test-context.js';

const infrastructure = registerIntegrationTestInfrastructure();
const menuContext = registerMenuIntegrationTestContext(infrastructure);

describe('PrismaBranchMenuItemRepository (Integration)', () => {
  let repository: PrismaBranchMenuItemRepository;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = infrastructure.database.client;

    repository = new PrismaBranchMenuItemRepository(prisma);
  });

  // ------------------------------------------
  // findById
  // ------------------------------------------

  describe('findById', () => {
    it('should return a branch menu item when it exists', async () => {
      // Arrange

      const { organization, branch } =
        await menuContext.factories.fixture.create();

      const menuItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب',
      });

      const createdBranchMenuItem =
        await menuContext.factories.branchMenuItem.create({
          organizationId: organization.id,
          branchId: branch.id,
          menuItemId: menuItem.id,
          priceOverride: 180_000n,
          displayOrder: 3,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
        });

      // Act

      const actual = await repository.findById(
        organization.id,
        createdBranchMenuItem.id,
      );

      // Assert

      expect(actual).not.toBeNull();
      expect(actual).toBeInstanceOf(BranchMenuItem);

      expect(actual?.id).toBe(createdBranchMenuItem.id);
      expect(actual?.organizationId).toBe(organization.id);
      expect(actual?.branchId).toBe(branch.id);
      expect(actual?.menuItemId).toBe(menuItem.id);
      expect(actual?.priceOverride?.value).toBe(180_000);
      expect(actual?.displayOrder).toBe(3);
      expect(actual?.status).toBe('ACTIVE');
      expect(actual?.availability).toBe('AVAILABLE');
    });

    it('should return null when the branch menu item does not exist', async () => {
      // Arrange

      const { organization } = await menuContext.factories.fixture.create();

      const nonExistingId = 'non-existing-branch-menu-item';

      // Act

      const actual = await repository.findById(organization.id, nonExistingId);

      // Assert

      expect(actual).toBeNull();
    });

    it('should not return a branch menu item belonging to another organization', async () => {
      // Arrange

      const { organization: firstOrganization, branch } =
        await menuContext.factories.fixture.create();

      const { organization: secondOrganization } =
        await menuContext.factories.fixture.create();

      const menuItem = await menuContext.factories.item.create({
        organizationId: firstOrganization.id,
      });

      const createdBranchMenuItem =
        await menuContext.factories.branchMenuItem.create({
          organizationId: firstOrganization.id,
          branchId: branch.id,
          menuItemId: menuItem.id,
        });

      // Act

      const actual = await repository.findById(
        secondOrganization.id,
        createdBranchMenuItem.id,
      );

      // Assert

      expect(actual).toBeNull();
    });
  });

  // ------------------------------------------
  // findByBranchAndMenuItem
  // ------------------------------------------

  describe('findByBranchAndMenuItem', () => {
    it('should return a branch menu item for the specified branch and menu item', async () => {
      // Arrange

      const { organization, branch } =
        await menuContext.factories.fixture.create();

      const menuItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'پیتزا',
      });

      const createdBranchMenuItem =
        await menuContext.factories.branchMenuItem.create({
          organizationId: organization.id,
          branchId: branch.id,
          menuItemId: menuItem.id,
          priceOverride: 250_000n,
          displayOrder: 2,
        });

      // Act

      const actual = await repository.findByBranchAndMenuItem(
        organization.id,
        branch.id,
        menuItem.id,
      );

      // Assert

      expect(actual).not.toBeNull();
      expect(actual).toBeInstanceOf(BranchMenuItem);

      expect(actual?.id).toBe(createdBranchMenuItem.id);
      expect(actual?.organizationId).toBe(organization.id);
      expect(actual?.branchId).toBe(branch.id);
      expect(actual?.menuItemId).toBe(menuItem.id);
      expect(actual?.priceOverride?.value).toBe(250_000);
    });

    it('should return null when the menu item is not assigned to the branch', async () => {
      // Arrange

      const { organization, branch } =
        await menuContext.factories.fixture.create();

      const menuItem = await menuContext.factories.item.create({
        organizationId: organization.id,
      });

      // No BranchMenuItem association is created.

      // Act

      const actual = await repository.findByBranchAndMenuItem(
        organization.id,
        branch.id,
        menuItem.id,
      );

      // Assert

      expect(actual).toBeNull();
    });
  });

  // ------------------------------------------
  // save
  // ------------------------------------------

  describe('save', () => {
    it('should persist a branch menu item in the database', async () => {
      // Arrange

      const { organization, branch } =
        await menuContext.factories.fixture.create();

      const menuItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'جوجه کباب',
      });

      const branchMenuItem = BranchMenuItem.create({
        organizationId: organization.id,
        branchId: branch.id,
        menuItemId: menuItem.id,
        priceOverrideInToman: 200_000,
        displayOrder: 5,
      });

      infrastructure.cleanup.add(async () => {
        await prisma.branchMenuItem.deleteMany({
          where: {
            id: branchMenuItem.id,
            organizationId: organization.id,
          },
        });
      });

      // Act

      await repository.save(branchMenuItem);

      const actual = await prisma.branchMenuItem.findFirst({
        where: {
          id: branchMenuItem.id,
          organizationId: organization.id,
        },
      });

      // Assert

      expect(actual).not.toBeNull();

      expect(actual).toMatchObject({
        id: branchMenuItem.id,
        organizationId: organization.id,
        branchId: branch.id,
        menuItemId: menuItem.id,
        priceOverride: 200_000n,
        displayOrder: 5,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
      });
    });
  });

  // ------------------------------------------
  // update
  // ------------------------------------------

  describe('update', () => {
    it('should update an existing branch menu item', async () => {
      // Arrange

      const { organization, branch } =
        await menuContext.factories.fixture.create();

      const menuItem = await menuContext.factories.item.create({
        organizationId: organization.id,
        nameFa: 'کباب',
      });

      const createdBranchMenuItem =
        await menuContext.factories.branchMenuItem.create({
          organizationId: organization.id,
          branchId: branch.id,
          menuItemId: menuItem.id,
          priceOverride: 150_000n,
          displayOrder: 1,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
        });

      const branchMenuItem = await repository.findById(
        organization.id,
        createdBranchMenuItem.id,
      );

      expect(branchMenuItem).not.toBeNull();

      if (!branchMenuItem) {
        throw new Error('Branch menu item was not found.');
      }

      branchMenuItem.changePriceOverride(200_000);
      branchMenuItem.updateDisplayOrder(4);
      branchMenuItem.deactivate();
      branchMenuItem.markAsUnavailable();

      // Act

      await repository.update(branchMenuItem);

      const actual = await prisma.branchMenuItem.findFirst({
        where: {
          id: createdBranchMenuItem.id,
          organizationId: organization.id,
        },
      });

      // Assert

      expect(actual).not.toBeNull();

      expect(actual).toMatchObject({
        id: createdBranchMenuItem.id,
        organizationId: organization.id,
        branchId: branch.id,
        menuItemId: menuItem.id,
        priceOverride: 200_000n,
        displayOrder: 4,
        status: 'INACTIVE',
        availability: 'UNAVAILABLE',
        updatedAt: branchMenuItem.updatedAt,
      });

      expect(actual?.createdAt).toEqual(createdBranchMenuItem.createdAt);
    });

    // ------------------------------------------
    // CHALLENGING SCENARIOS
    // ------------------------------------------

    it.todo(
      'should not update a branch menu item belonging to another organization',
    );

    it.todo(
      'should throw an error when updating a non-existing branch menu item',
    );
  });
});
