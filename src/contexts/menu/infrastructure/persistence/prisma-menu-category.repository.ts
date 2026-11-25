import { Injectable } from '@nestjs/common';
import type { MenuCategoryPort } from '../../application/ports/menu-category.port.js';
import { MenuCategory } from '../../domain/entities/menu-category.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

@Injectable()
export class PrismaMenuCategoryRepository implements MenuCategoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    organizationId: string,
    categoryId: string,
  ): Promise<MenuCategory | null> {
    let categoryRecord;

    try {
      categoryRecord = await this.prisma.menuCategory.findUnique({
        where: {
          id_organizationId: {
            id: categoryId,
            organizationId,
          },
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }

    if (!categoryRecord) {
      return null;
    }

    return MenuCategory.reconstitute(categoryRecord);
  }

  async findByIds(
    organizationId: string,
    categoryIds: readonly string[],
  ): Promise<MenuCategory[]> {
    if (categoryIds.length === 0) {
      return [];
    }

    let categoryRecords;

    try {
      categoryRecords = await this.prisma.menuCategory.findMany({
        where: {
          organizationId,
          id: {
            in: [...categoryIds],
          },
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }

    return categoryRecords.map((category) =>
      MenuCategory.reconstitute(category),
    );
  }

  async save(category: MenuCategory): Promise<void> {
    try {
      await this.prisma.menuCategory.create({
        data: {
          id: category.id,
          organizationId: category.organizationId,
          nameFa: category.nameFa,
          nameEn: category.nameEn,
          descriptionFa: category.descriptionFa,
          descriptionEn: category.descriptionEn,
          imageId: category.imageId,
          displayOrder: category.displayOrder,
          status: category.status,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }
  }

  async update(category: MenuCategory): Promise<void> {
    try {
      await this.prisma.menuCategory.update({
        where: {
          id_organizationId: {
            id: category.id,
            organizationId: category.organizationId,
          },
        },
        data: {
          nameFa: category.nameFa,
          nameEn: category.nameEn,
          descriptionFa: category.descriptionFa,
          descriptionEn: category.descriptionEn,
          imageId: category.imageId,
          displayOrder: category.displayOrder,
          status: category.status,
          updatedAt: category.updatedAt,
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }
  }
}
