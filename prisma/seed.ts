import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

import { synchronizeAccessControlRegistry } from './seed/access-control-seed.js';

// ============================================================
// DATABASE CONNECTION
// ============================================================

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ============================================================
// MAIN SEED
// ============================================================

async function main(): Promise<void> {
  console.log('Starting database seeding...');

  // The complete Access Control synchronization runs atomically.
  // Any failure rolls back permissions and both System Roles.
  const result = await prisma.$transaction(
    (tx) => synchronizeAccessControlRegistry(tx),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  );

  console.log(
    `Synchronized ${result.permissionCount} source-controlled permissions.`,
  );

  for (const role of result.roles) {
    console.log(
      `Synchronized System Role "${role.code}" with ${role.permissionCount} permissions.`,
    );
  }

  console.log('Database seeding completed successfully.');
}

// ============================================================
// EXECUTION
// ============================================================

main()
  .catch((error: unknown) => {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
