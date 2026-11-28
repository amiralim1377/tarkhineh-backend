import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../cleanup/integration-test-cleanup.js';

interface CreateMenuCategoryInput {
  organizationId: string;
  nameFa?: string;
  nameEn?: string | null;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  imageId?: string | null;
  displayOrder?: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export class MenuCategoryFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create(input: CreateMenuCategoryInput) {
    const category = await this.prisma.menuCategory.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        nameFa: input.nameFa ?? 'دسته‌بندی تست',
        nameEn: input.nameEn ?? 'Test Category',
        descriptionFa: input.descriptionFa ?? null,
        descriptionEn: input.descriptionEn ?? null,
        imageId: input.imageId ?? null,
        displayOrder: input.displayOrder ?? 0,
        status: input.status ?? 'ACTIVE',
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.menuCategory.deleteMany({
        where: {
          id: category.id,
          organizationId: category.organizationId,
        },
      });
    });

    return category;
  }
}
