import 'dotenv/config';

import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

import { IdentityUser } from '../src/contexts/identity-access/domain/entities/identity-user.js';
import { Organization } from '../src/contexts/organization-management/domain/entities/organization.js';

// ============================================================
// CONFIGURATION
// ============================================================

interface BootstrapAdminConfig {
  readonly connectionString: string;
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

const INITIAL_ORGANIZATION = {
  name: 'Tarkhineh',
  slug: 'tarkhineh',
} as const;

const ORGANIZATION_OWNER_ROLE = {
  code: 'ORGANIZATION_OWNER',
  scope: 'SYSTEM',
  assignmentScope: 'ORGANIZATION',
} as const;

// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================

function getEnvConfig(): BootstrapAdminConfig {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName =
    process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || 'مدیر مرکزی';

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid bootstrap admin email is required.');
  }

  if (!password || password.length < 14) {
    throw new Error('The admin password must be at least 14 characters.');
  }

  return {
    connectionString,
    email,
    password,
    displayName,
  };
}

// ============================================================
// BOOTSTRAP
// ============================================================

async function main(): Promise<void> {
  const config = getEnvConfig();

  const adapter = new PrismaPg({
    connectionString: config.connectionString,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    // --------------------------------------------------------
    // 1. Hash the administrator password.
    // --------------------------------------------------------

    const passwordHash = await argon2.hash(config.password, {
      type: argon2.argon2id,
    });

    const emailVerifiedAt = new Date();

    // --------------------------------------------------------
    // 2. Create the initial identity through the Domain Entity.
    // --------------------------------------------------------

    const adminIdentity = IdentityUser.provisionVerified({
      email: config.email,
      emailVerifiedAt,
      passwordHash,
      displayName: config.displayName,
    });

    // The factory guarantees these values are present.
    const adminEmail = adminIdentity.email;
    const adminPasswordHash = adminIdentity.passwordHash;
    const adminEmailVerifiedAt = adminIdentity.emailVerifiedAt;

    if (
      adminEmail === null ||
      adminPasswordHash === null ||
      adminEmailVerifiedAt === null
    ) {
      throw new Error('Bootstrap identity data is incomplete.');
    }

    // --------------------------------------------------------
    // 3. Create the initial organization through the Domain Entity.
    // --------------------------------------------------------

    const organization = Organization.create({
      name: INITIAL_ORGANIZATION.name,
      slug: INITIAL_ORGANIZATION.slug,
      ownerUserId: adminIdentity.id,
    });

    // --------------------------------------------------------
    // 4. Persist the initial state atomically.
    // --------------------------------------------------------

    const result = await prisma.$transaction(async (tx) => {
      // Verify that the system owner role has been seeded.
      const ownerRole = await tx.role.findFirst({
        where: {
          code: ORGANIZATION_OWNER_ROLE.code,
          scope: ORGANIZATION_OWNER_ROLE.scope,
          assignmentScope: ORGANIZATION_OWNER_ROLE.assignmentScope,
        },
        select: {
          id: true,
          code: true,
        },
      });

      if (!ownerRole) {
        throw new Error(
          'ORGANIZATION_OWNER role not found. Run the database seed first.',
        );
      }

      // Ensure that the bootstrap administrator does not exist.
      const existingUser = await tx.user.findUnique({
        where: {
          email: adminEmail,
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        throw new Error(
          'Bootstrap administrator already exists. No account was changed.',
        );
      }

      // Ensure that the initial organization does not already exist.
      const existingOrganization = await tx.organization.findFirst({
        select: {
          id: true,
          slug: true,
        },
      });

      if (existingOrganization) {
        throw new Error(
          'An organization already exists. Bootstrap was aborted.',
        );
      }

      // Create the administrator identity.
      const user = await tx.user.create({
        data: {
          id: adminIdentity.id,
          email: adminEmail,
          emailVerifiedAt: adminEmailVerifiedAt,
          passwordHash: adminPasswordHash,
          displayName: adminIdentity.displayName,
          status: adminIdentity.status,
        },
        select: {
          id: true,
          email: true,
        },
      });

      // Create the initial organization.
      const savedOrganization = await tx.organization.create({
        data: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          ownerUserId: user.id,
          status: organization.status,
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });

      // Create the owner's organization membership.
      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: savedOrganization.id,
          userId: user.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });

      // Assign the organization owner role to the membership.
      const roleAssignment = await tx.roleAssignment.create({
        data: {
          roleId: ownerRole.id,
          organizationMembershipId: membership.id,
        },
        select: {
          id: true,
        },
      });

      return {
        user,
        organization: savedOrganization,
        membership,
        roleAssignment,
        role: ownerRole,
      };
    });

    // --------------------------------------------------------
    // 5. Report successful bootstrap.
    // --------------------------------------------------------

    console.log('Initial Tarkhineh bootstrap completed successfully.');

    console.log({
      adminEmail: result.user.email,
      organizationName: result.organization.name,
      organizationSlug: result.organization.slug,
      organizationMembershipId: result.membership.id,
      role: result.role.code,
      roleAssignmentId: result.roleAssignment.id,
    });
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================
// EXECUTION
// ============================================================

main().catch((error: unknown) => {
  console.error('Tarkhineh bootstrap failed:', error);
  process.exitCode = 1;
});
