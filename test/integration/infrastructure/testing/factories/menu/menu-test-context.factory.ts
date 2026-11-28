import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../../../../src/generated/prisma/client.js';

export class MenuTestContextFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create() {
    return this.prisma.$transaction(async (tx) => {
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

      return {
        user,
        organization,
        branch,
      };
    });
  }
}
