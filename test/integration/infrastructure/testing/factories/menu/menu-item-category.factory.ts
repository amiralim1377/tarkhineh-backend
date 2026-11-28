import { PrismaClient } from '../../../../../../src/generated/prisma/client.js';

interface CreateMenuItemCategoryInput {
  organizationId: string;
  menuItemId: string;
  categoryId: string;
  displayOrder?: number;
}

export class MenuItemCategoryFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateMenuItemCategoryInput) {
    return this.prisma.menuItemCategory.create({
      data: {
        organizationId: input.organizationId,
        menuItemId: input.menuItemId,
        categoryId: input.categoryId,
        displayOrder: input.displayOrder ?? 0,
      },
    });
  }
}
