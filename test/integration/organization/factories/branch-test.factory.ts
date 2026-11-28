import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../infrastructure/testing/cleanup/integration-test-cleanup.js';

interface CreateBranchTestInput {
  organizationId: string;
}

export class BranchTestFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create(input: CreateBranchTestInput) {
    const uniqueId = randomUUID();

    const branch = await this.prisma.branch.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        nameFa: 'شعبه تست',
        nameEn: 'Test Branch',
        slug: `integration-test-branch-${uniqueId}`,
        addressFa: 'آدرس تست',
        addressEn: 'Test Address',
        cityFa: 'تهران',
        cityEn: 'Tehran',
        countryCode: 'IR',
        timeZoneId: 'Asia/Tehran',
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.branch.deleteMany({
        where: {
          id: branch.id,
          organizationId: branch.organizationId,
        },
      });
    });

    return branch;
  }
}
