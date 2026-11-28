import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../../../../src/generated/prisma/client.js';

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
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateMenuCategoryInput) {
    return this.prisma.menuCategory.create({
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
  }
}
