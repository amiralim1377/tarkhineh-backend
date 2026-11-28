import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '../../../../src/generated/prisma/client.js';
import type { IntegrationTestCleanup } from '../../infrastructure/testing/cleanup/integration-test-cleanup.js';

export class UserTestFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cleanup: IntegrationTestCleanup,
  ) {}

  async create() {
    const uniqueId = randomUUID();

    const user = await this.prisma.user.create({
      data: {
        email: `integration-test-${uniqueId}@example.com`,
        displayName: 'Integration Test User',
        status: 'ACTIVE',
      },
    });

    this.cleanup.add(async () => {
      await this.prisma.user.deleteMany({
        where: { id: user.id },
      });
    });

    return user;
  }
}
