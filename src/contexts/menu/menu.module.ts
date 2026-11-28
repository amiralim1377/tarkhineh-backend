import { Module } from '@nestjs/common';
import { MENU_CATEGORY_PORT } from './application/ports/menu-category.port.js';
import { PrismaMenuCategoryRepository } from './infrastructure/persistence/prisma-menu-category.repository.js';
import { BRANCH_MENU_ITEM_PORT } from './application/ports/branch-menu-item.port.js';
import { MENU_ITEM_PORT } from './application/ports/menu-item.port.js';
import { PrismaMenuItemRepository } from './infrastructure/persistence/prisma-menu-item.repository.js';
import { PrismaMenuItemUnitOfWork } from './infrastructure/persistence/prisma-menu-item.unit-of-work.js';
import { MENU_ITEM_UNIT_OF_WORK } from './application/ports/menu-item-unit-of-work.port.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaBranchMenuItemRepository } from './infrastructure/persistence/prisma-branch-menu-item.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [
    PrismaMenuItemUnitOfWork,
    {
      provide: MENU_CATEGORY_PORT,
      useClass: PrismaMenuCategoryRepository,
    },
    {
      provide: MENU_ITEM_PORT,
      useClass: PrismaMenuItemRepository,
    },
    {
      provide: MENU_ITEM_UNIT_OF_WORK,
      useExisting: PrismaMenuItemUnitOfWork,
    },
    {
      provide: BRANCH_MENU_ITEM_PORT,
      useClass: PrismaBranchMenuItemRepository,
    },
  ],
  exports: [],
})
export class MenuModule {}
