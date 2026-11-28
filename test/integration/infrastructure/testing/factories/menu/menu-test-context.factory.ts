import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '../../../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../cleanup/integration-test-cleanup.js';

export class MenuTestContextFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create() {
    const context = await this.prisma.$transaction(async (tx) => {
      const uniqueId = randomUUID();

      const user = await tx.user.create({
        data: {
          email: `menu-test-${uniqueId}@example.com`,
          displayName: 'Menu Test Owner',
          status: 'ACTIVE',
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: 'Menu Test Organization',
          slug: `menu-test-org-${uniqueId}`,
          ownerUserId: user.id,
        },
      });

      const branch = await tx.branch.create({
        data: {
          id: randomUUID(),
          organizationId: organization.id,
          nameFa: 'شعبه تست',
          nameEn: 'Test Branch',
          slug: `menu-test-branch-${uniqueId}`,
          addressFa: 'آدرس تست',
          addressEn: 'Test Address',
          cityFa: 'تهران',
          cityEn: 'Tehran',
          countryCode: 'IR',
          timeZoneId: 'Asia/Tehran',
        },
      });

      return { user, organization, branch };
    });

    // Registration order matters: cleanup runs in reverse order.
    this.cleanup.add(async () => {
      await this.prisma.user.deleteMany({
        where: { id: context.user.id },
      });
    });

    this.cleanup.add(async () => {
      await this.prisma.organization.deleteMany({
        where: { id: context.organization.id },
      });
    });

    this.cleanup.add(async () => {
      await this.prisma.branch.deleteMany({
        where: {
          id: context.branch.id,
          organizationId: context.organization.id,
        },
      });
    });

    return context;
  }
}
