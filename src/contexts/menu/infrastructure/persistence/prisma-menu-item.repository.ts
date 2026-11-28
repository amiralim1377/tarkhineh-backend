import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { MenuItemPort } from '../../application/ports/menu-item.port.js';
import { MenuItem } from '../../domain/entities/menu-item.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaMenuItemMapper } from './mappers/prisma-menu-item.mapper.js';

type MenuItemPrismaClient = Pick<
  Prisma.TransactionClient,
  'menuItem' | 'menuItemCategory'
>;

@Injectable()
export class PrismaMenuItemRepository implements MenuItemPort {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: MenuItemPrismaClient,
  ) {}

  async findById(
    organizationId: string,
    menuItemId: string,
  ): Promise<MenuItem | null> {
    let menuItemRecord;

    try {
      menuItemRecord = await this.prisma.menuItem.findUnique({
        where: {
          id_organizationId: {
            id: menuItemId,
            organizationId,
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
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw error;
      }

      throw normalizePrismaError(error);
    }

    if (!menuItemRecord) {
      return null;
    }

    return PrismaMenuItemMapper.toDomain(menuItemRecord);
  }

  async save(menuItem: MenuItem): Promise<void> {
    const data = PrismaMenuItemMapper.toPersistence(menuItem);

    try {
      await this.prisma.menuItem.create({
        data,
      });

      if (menuItem.categoryIds.length === 0) {
        return;
      }

      await this.prisma.menuItemCategory.createMany({
        data: menuItem.categoryIds.map((categoryId) => ({
          organizationId: menuItem.organizationId,
          menuItemId: menuItem.id,
          categoryId,
          displayOrder: 0,
        })),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        // Write Conflict or Deadlock
        throw error;
      }

      throw normalizePrismaError(error);
    }
  }

  async update(menuItem: MenuItem): Promise<void> {
    const data = PrismaMenuItemMapper.toPersistence(menuItem);

    try {
      const existingCategories = await this.prisma.menuItemCategory.findMany({
        where: {
          organizationId: menuItem.organizationId,
          menuItemId: menuItem.id,
        },
        select: {
          categoryId: true,
        },
      });

      const existingCategoryIds = new Set(
        existingCategories.map((item) => item.categoryId),
      );

      const nextCategoryIds = new Set(menuItem.categoryIds);

      const categoryIdsToRemove = [...existingCategoryIds].filter(
        (categoryId) => !nextCategoryIds.has(categoryId),
      );

      const categoryIdsToAdd = [...nextCategoryIds].filter(
        (categoryId) => !existingCategoryIds.has(categoryId),
      );

      await this.prisma.menuItem.update({
        where: {
          id_organizationId: {
            id: menuItem.id,
            organizationId: menuItem.organizationId,
          },
        },
        data: {
          nameFa: data.nameFa,
          nameEn: data.nameEn,
          descriptionFa: data.descriptionFa,
          descriptionEn: data.descriptionEn,
          imageId: data.imageId,
          basePrice: data.basePrice,
          status: data.status,
          updatedAt: data.updatedAt,
        },
      });

      if (categoryIdsToRemove.length > 0) {
        await this.prisma.menuItemCategory.deleteMany({
          where: {
            organizationId: menuItem.organizationId,
            menuItemId: menuItem.id,
            categoryId: {
              in: categoryIdsToRemove,
            },
          },
        });
      }

      if (categoryIdsToAdd.length > 0) {
        await this.prisma.menuItemCategory.createMany({
          data: categoryIdsToAdd.map((categoryId) => ({
            organizationId: menuItem.organizationId,
            menuItemId: menuItem.id,
            categoryId,
            displayOrder: 0,
          })),
        });
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw error;
      }

      throw normalizePrismaError(error);
    }
  }
}
