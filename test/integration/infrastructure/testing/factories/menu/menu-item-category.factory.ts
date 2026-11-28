import type { PrismaClient } from '../../../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../cleanup/integration-test-cleanup.js';

interface CreateMenuItemCategoryInput {
  organizationId: string;
  menuItemId: string;
  categoryId: string;
  displayOrder?: number;
}

export class MenuItemCategoryFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create(input: CreateMenuItemCategoryInput) {
    const itemCategory = await this.prisma.menuItemCategory.create({
      data: {
        organizationId: input.organizationId,
        menuItemId: input.menuItemId,
        categoryId: input.categoryId,
        displayOrder: input.displayOrder ?? 0,
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.menuItemCategory.deleteMany({
        where: {
          organizationId: itemCategory.organizationId,
          menuItemId: itemCategory.menuItemId,
          categoryId: itemCategory.categoryId,
        },
      });
    });

    return itemCategory;
  }
}
