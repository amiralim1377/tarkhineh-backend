import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../infrastructure/testing/cleanup/integration-test-cleanup.js';

interface CreateBranchMenuItemInput {
  organizationId: string;
  branchId: string;
  menuItemId: string;
  priceOverride?: bigint | null;
  displayOrder?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  availability?: 'AVAILABLE' | 'UNAVAILABLE';
}

export class BranchMenuItemFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create(input: CreateBranchMenuItemInput) {
    const branchMenuItem = await this.prisma.branchMenuItem.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        branchId: input.branchId,
        menuItemId: input.menuItemId,
        priceOverride: input.priceOverride ?? null,
        displayOrder: input.displayOrder ?? 0,
        status: input.status ?? 'ACTIVE',
        availability: input.availability ?? 'AVAILABLE',
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.branchMenuItem.deleteMany({
        where: { id: branchMenuItem.id },
      });
    });

    return branchMenuItem;
  }
}
