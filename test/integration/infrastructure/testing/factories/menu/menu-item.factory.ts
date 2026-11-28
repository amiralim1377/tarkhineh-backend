import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../../../../src/generated/prisma/client.js';

interface CreateMenuItemInput {
  organizationId: string;
  nameFa?: string;
  nameEn?: string | null;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  imageId?: string | null;
  basePrice?: bigint;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export class MenuItemFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateMenuItemInput) {
    return this.prisma.menuItem.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        nameFa: input.nameFa ?? 'آیتم تست',
        nameEn: input.nameEn ?? 'Test Item',
        descriptionFa: input.descriptionFa ?? null,
        descriptionEn: input.descriptionEn ?? null,
        imageId: input.imageId ?? null,
        basePrice: input.basePrice ?? 100_000n,
        status: input.status ?? 'DRAFT',
      },
    });
  }
}
