import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../infrastructure/testing/cleanup/integration-test-cleanup.js';

interface CreateOrganizationTestInput {
  ownerUserId: string;
}

export class OrganizationTestFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create(input: CreateOrganizationTestInput) {
    const uniqueId = randomUUID();

    const organization = await this.prisma.organization.create({
      data: {
        name: 'Integration Test Organization',
        slug: `integration-test-org-${uniqueId}`,
        ownerUserId: input.ownerUserId,
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.organization.deleteMany({
        where: { id: organization.id },
      });
    });

    return organization;
  }
}
