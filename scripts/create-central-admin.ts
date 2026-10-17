import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

function getEnvConfig(): {
  connectionString: string;
  email: string;
  password: string;
} {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid bootstrap admin email is required.');
  }

  if (!password || password.length < 14) {
    throw new Error('The admin password must be at least 14 characters.');
  }

  return { connectionString, email, password };
}

const { connectionString, email, password } = getEnvConfig();

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error('This email already exists. No account was changed.');
  }

  const centralAdminRole = await prisma.role.findUnique({
    where: { code: 'CENTRAL_ADMIN' },
  });

  if (!centralAdminRole) {
    throw new Error(
      'CENTRAL_ADMIN role not found. Run the database seed first.',
    );
  }

  const passwordHash = await argon2.hash(password);

  const admin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        emailVerifiedAt: new Date(),
        passwordHash,
        displayName: 'Central Admin',
        status: 'ACTIVE',
      },
    });

    await tx.roleAssignment.create({
      data: {
        userId: user.id,
        roleId: centralAdminRole.id,
      },
    });

    return user;
  });

  console.log(`Central admin created successfully: ${admin.email}`);
}

main()
  .catch((error: unknown) => {
    console.error('Failed to create central admin:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
