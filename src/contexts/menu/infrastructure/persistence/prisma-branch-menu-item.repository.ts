import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { BranchMenuItemPort } from '../../application/ports/branch-menu-item.port.js';
import { BranchMenuItem } from '../../domain/entities/branch-menu-item.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { PrismaBranchMenuItemMapper } from './mappers/prisma-branch-menu-item.mapper.js';

type BranchMenuItemPrismaClient = Pick<
  Prisma.TransactionClient,
  'branchMenuItem'
>;

@Injectable()
export class PrismaBranchMenuItemRepository implements BranchMenuItemPort {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: BranchMenuItemPrismaClient,
  ) {}

  async findById(
    organizationId: string,
    branchMenuItemId: string,
  ): Promise<BranchMenuItem | null> {
    let branchMenuItemRecord;

    try {
      branchMenuItemRecord = await this.prisma.branchMenuItem.findFirst({
        where: {
          id: branchMenuItemId,
          organizationId,
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

    if (!branchMenuItemRecord) {
      return null;
    }

    return PrismaBranchMenuItemMapper.toDomain(branchMenuItemRecord);
  }

  async findByBranchAndMenuItem(
    organizationId: string,
    branchId: string,
    menuItemId: string,
  ): Promise<BranchMenuItem | null> {
    let branchMenuItemRecord;

    try {
      branchMenuItemRecord = await this.prisma.branchMenuItem.findFirst({
        where: {
          organizationId,
          branchId,
          menuItemId,
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

    if (!branchMenuItemRecord) {
      return null;
    }

    return PrismaBranchMenuItemMapper.toDomain(branchMenuItemRecord);
  }

  async save(branchMenuItem: BranchMenuItem): Promise<void> {
    const data = PrismaBranchMenuItemMapper.toPersistence(branchMenuItem);

    try {
      await this.prisma.branchMenuItem.create({
        data,
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
  }

  async update(branchMenuItem: BranchMenuItem): Promise<void> {
    const data = PrismaBranchMenuItemMapper.toPersistence(branchMenuItem);

    try {
      await this.prisma.branchMenuItem.update({
        where: {
          id: branchMenuItem.id,
          organizationId: branchMenuItem.organizationId,
        },
        data: {
          priceOverride: data.priceOverride,
          displayOrder: data.displayOrder,
          status: data.status,
          availability: data.availability,
          updatedAt: data.updatedAt,
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
  }
}
