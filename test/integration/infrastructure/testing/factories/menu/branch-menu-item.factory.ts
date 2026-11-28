import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../../../../src/generated/prisma/client.js';

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
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateBranchMenuItemInput) {
    return this.prisma.branchMenuItem.create({
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
  }
}
