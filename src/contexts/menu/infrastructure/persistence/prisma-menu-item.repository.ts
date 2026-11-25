import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { MenuItemPort } from '../../application/ports/menu-item.port.js';
import { MenuItem } from '../../domain/entities/menu-item.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaMenuItemMapper } from './mappers/prisma-menu-item.mapper.js';

@Injectable()
export class PrismaMenuCategoryRepository implements MenuItemPort {
  constructor(private readonly prisma: PrismaService) {}

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
      throw normalizePrismaError(error);
    }

    if (!menuItemRecord) {
      return null;
    }

    return PrismaMenuItemMapper.toDomain(menuItemRecord);
  }

  async save(menuItem: MenuItem): Promise<void> {}

  async update(menuItem: MenuItem): Promise<void> {}
}
