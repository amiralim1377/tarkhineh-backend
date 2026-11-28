import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../infrastructure/testing/cleanup/integration-test-cleanup.js';

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
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create(input: CreateMenuItemInput) {
    const item = await this.prisma.menuItem.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        nameFa: input.nameFa ?? 'آیتم تست',
        nameEn: input.nameEn === undefined ? 'Test Item' : input.nameEn,
        descriptionFa: input.descriptionFa ?? null,
        descriptionEn: input.descriptionEn ?? null,
        imageId: input.imageId ?? null,
        basePrice: input.basePrice ?? 100_000n,
        status: input.status ?? 'DRAFT',
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.menuItem.deleteMany({
        where: {
          id: item.id,
          organizationId: item.organizationId,
        },
      });
    });

    return item;
  }
}
