import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { PrismaTransactionRunner } from '../../../src/prisma/transaction/prisma-transaction-runner.js';
import { UniqueId } from '../../../src/shared/domain/value-objects/unique-id.vo.js';
import { MembershipInvitation } from '../../../src/contexts/organization-management/domain/entities/membership-invitation.js';
import { MEMBERSHIP_INVITATION_SCOPE } from '../../../src/contexts/organization-management/domain/types/membership-invitation-scope.js';
import type { EnqueueMembershipInvitationEmailInput } from '../../../src/contexts/organization-management/application/ports/membership-invitation-email.port.js';
import { PrismaOrganizationManagementUnitOfWork } from '../../../src/contexts/organization-management/infrastructure/persistence/prisma-organization-management.unit-of-work.js';

import { OutboundEmailIdempotencyConflictError } from '../../../src/contexts/outbound-email/application/errors/outbound-email-idempotency-conflict.error.js';
import { OutboundEmailEnqueueService } from '../../../src/contexts/outbound-email/application/services/outbound-email-enqueue.service.js';

import { PrismaOutboundEmailMessageStore } from '../../../src/contexts/outbound-email/infrastructure/persistence/prisma-outbound-email-message.store.js';
import { AesGcmOutboundEmailPayloadEncryptor } from '../../../src/contexts/outbound-email/infrastructure/security/aes-gcm-outbound-email-payload-encryptor.js';
import { HmacOutboundEmailRequestFingerprinter } from '../../../src/contexts/outbound-email/infrastructure/security/hmac-outbound-email-request-fingerprinter.js';

// ============================================================
// TEST DATABASE SAFETY
// ============================================================

function createTestDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error('DATABASE_URL must be configured for integration tests');
  }

  const url = new URL(configuredUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (databaseName !== 'tarkhineh_db') {
    throw new Error(
      'Refusing to run Organization Management integration tests from an unexpected database URL',
    );
  }

  url.pathname = '/tarkhineh_test';

  return url.toString();
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured for integration tests`);
  }

  return value;
}

const testDatabaseUrl = createTestDatabaseUrl();

const configService = {
  getOrThrow(key: string): string {
    switch (key) {
      case 'DATABASE_URL':
        return testDatabaseUrl;

      case 'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY':
        return getRequiredEnvironmentVariable(
          'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTION_KEY',
        );

      case 'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY':
        return getRequiredEnvironmentVariable(
          'OUTBOUND_EMAIL_REQUEST_FINGERPRINT_KEY',
        );

      default:
        throw new Error(`Unexpected configuration key: ${key}`);
    }
  },
} as unknown as ConfigService;

// ============================================================
// REAL INFRASTRUCTURE COMPOSITION
// ============================================================

const prisma = new PrismaService(configService);

const transactionRunner = new PrismaTransactionRunner(prisma);

const messageStore = new PrismaOutboundEmailMessageStore();

const payloadEncryptor = new AesGcmOutboundEmailPayloadEncryptor(configService);

const requestFingerprinter = new HmacOutboundEmailRequestFingerprinter(
  configService,
);

const outboundEmailEnqueue = new OutboundEmailEnqueueService(
  payloadEncryptor,
  messageStore,
  requestFingerprinter,
);

const unitOfWork = new PrismaOrganizationManagementUnitOfWork(
  transactionRunner,
  outboundEmailEnqueue,
);

// ============================================================
// FIXTURES
// ============================================================

interface OrganizationFixture {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly inviterUserId: string;
}

const userIds = new Set<string>();
const organizationIds = new Set<string>();
const invitationIds = new Set<string>();
const idempotencyKeys = new Set<string>();

function getInvitationIdempotencyKey(invitationId: string): string {
  return `membership-invitation:${invitationId}`;
}

async function createOrganizationFixture(): Promise<OrganizationFixture> {
  const suffix = randomUUID();

  const owner = await prisma.user.create({
    data: {
      email: `owner-${suffix}@integration-test.example.com`,
      displayName: 'Integration Test Owner',
      status: 'ACTIVE',
    },
  });

  userIds.add(owner.id);

  const inviter = await prisma.user.create({
    data: {
      email: `inviter-${suffix}@integration-test.example.com`,
      displayName: 'Integration Test Inviter',
      status: 'ACTIVE',
    },
  });

  userIds.add(inviter.id);

  const organization = await prisma.organization.create({
    data: {
      name: `Integration Test Organization ${suffix}`,
      slug: `integration-test-${suffix}`,
      ownerUserId: owner.id,
      status: 'ACTIVE',
    },
  });

  organizationIds.add(organization.id);

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    inviterUserId: inviter.id,
  };
}

function createInvitation(fixture: OrganizationFixture): MembershipInvitation {
  const invitation = MembershipInvitation.create({
    organizationId: fixture.organizationId,
    email: `employee-${randomUUID()}@integration-test.example.com`,
    inviterUserId: fixture.inviterUserId,
    tokenHash: `token-hash-${randomUUID()}`,
    scope: MEMBERSHIP_INVITATION_SCOPE.ORGANIZATION,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  invitationIds.add(invitation.id);
  idempotencyKeys.add(getInvitationIdempotencyKey(invitation.id));

  return invitation;
}

function createInvitationEmailInput(
  invitation: MembershipInvitation,
  organizationName: string,
): EnqueueMembershipInvitationEmailInput {
  return {
    invitationId: invitation.id,
    email: invitation.email,
    rawToken: `raw-invitation-token-${randomUUID()}`,
    scope: invitation.scope,
    organizationName,
    expiresAt: invitation.expiresAt,
  };
}

async function createLegacyOutboundEmailMessage(
  idempotencyKey: string,
  invitationId: string,
): Promise<void> {
  await prisma.outboundEmailMessage.create({
    data: {
      id: new UniqueId().getValue(),
      idempotencyKey,
      requestFingerprint: null,
      lane: 'TRANSACTIONAL',
      templateKey: 'organization.membership-invitation',
      payloadVersion: 1,
      encryptedPayload: 'v1:legacy-integration-test-payload',
      validUntil: new Date(Date.now() + 60 * 60 * 1000),
      aggregateType: 'MembershipInvitation',
      aggregateId: invitationId,
    },
  });

  idempotencyKeys.add(idempotencyKey);
}

// ============================================================
// TEST SUITE
// ============================================================

describe('PrismaOrganizationManagementUnitOfWork Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (idempotencyKeys.size > 0) {
      await prisma.outboundEmailMessage.deleteMany({
        where: {
          idempotencyKey: {
            in: [...idempotencyKeys],
          },
        },
      });

      idempotencyKeys.clear();
    }

    if (invitationIds.size > 0) {
      await prisma.membershipInvitation.deleteMany({
        where: {
          id: {
            in: [...invitationIds],
          },
        },
      });

      invitationIds.clear();
    }

    if (organizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: {
          id: {
            in: [...organizationIds],
          },
        },
      });

      organizationIds.clear();
    }

    if (userIds.size > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [...userIds],
          },
        },
      });

      userIds.clear();
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------
  // COMMIT
  // ----------------------------------------------------------

  it('commits the membership invitation and outbound email message atomically', async () => {
    const fixture = await createOrganizationFixture();
    const invitation = createInvitation(fixture);

    const emailInput = createInvitationEmailInput(
      invitation,
      fixture.organizationName,
    );

    await unitOfWork.execute(async (context) => {
      await context.membershipInvitationRepository.save(invitation);

      await context.membershipInvitationEmail.enqueueInvitationEmail(
        emailInput,
      );
    });

    const persistedInvitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });

    const idempotencyKey = getInvitationIdempotencyKey(invitation.id);

    const persistedEmail = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey,
      },
    });

    expect(persistedInvitation).not.toBeNull();
    expect(persistedInvitation?.id).toBe(invitation.id);
    expect(persistedInvitation?.organizationId).toBe(fixture.organizationId);
    expect(persistedInvitation?.inviterUserId).toBe(fixture.inviterUserId);
    expect(persistedInvitation?.email).toBe(invitation.email);
    expect(persistedInvitation?.tokenHash).toBe(invitation.tokenHash);
    expect(persistedInvitation?.scope).toBe('ORGANIZATION');
    expect(persistedInvitation?.status).toBe('PENDING');

    expect(persistedEmail).not.toBeNull();
    expect(persistedEmail?.idempotencyKey).toBe(idempotencyKey);
    expect(persistedEmail?.lane).toBe('TRANSACTIONAL');
    expect(persistedEmail?.templateKey).toBe(
      'organization.membership-invitation',
    );
    expect(persistedEmail?.payloadVersion).toBe(1);
    expect(persistedEmail?.status).toBe('PENDING');
    expect(persistedEmail?.aggregateType).toBe('MembershipInvitation');
    expect(persistedEmail?.aggregateId).toBe(invitation.id);

    expect(persistedEmail?.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);

    expect(persistedEmail?.encryptedPayload).toMatch(/^v1:/);

    expect(persistedEmail?.validUntil?.getTime()).toBe(
      invitation.expiresAt.getTime(),
    );
  });

  // ----------------------------------------------------------
  // IDEMPOTENCY CONFLICT ROLLBACK
  // ----------------------------------------------------------

  it('rolls back the membership invitation when email enqueue encounters an existing legacy idempotency key', async () => {
    const fixture = await createOrganizationFixture();
    const invitation = createInvitation(fixture);

    const idempotencyKey = getInvitationIdempotencyKey(invitation.id);

    await createLegacyOutboundEmailMessage(idempotencyKey, invitation.id);

    const emailInput = createInvitationEmailInput(
      invitation,
      fixture.organizationName,
    );

    await expect(
      unitOfWork.execute(async (context) => {
        await context.membershipInvitationRepository.save(invitation);

        await context.membershipInvitationEmail.enqueueInvitationEmail(
          emailInput,
        );
      }),
    ).rejects.toBeInstanceOf(OutboundEmailIdempotencyConflictError);

    const persistedInvitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });

    const persistedEmail = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey,
      },
    });

    // The invitation insert must have been rolled back.
    expect(persistedInvitation).toBeNull();

    // The pre-existing message must remain untouched.
    expect(persistedEmail).not.toBeNull();
    expect(persistedEmail?.requestFingerprint).toBeNull();
    expect(persistedEmail?.encryptedPayload).toBe(
      'v1:legacy-integration-test-payload',
    );
  });

  // ----------------------------------------------------------
  // EXPLICIT TRANSACTION ROLLBACK
  // ----------------------------------------------------------

  it('rolls back both records when the transaction callback fails after both writes', async () => {
    const fixture = await createOrganizationFixture();
    const invitation = createInvitation(fixture);

    const emailInput = createInvitationEmailInput(
      invitation,
      fixture.organizationName,
    );

    const idempotencyKey = getInvitationIdempotencyKey(invitation.id);

    const expectedError = new Error(
      'Intentional Organization Management integration rollback.',
    );

    await expect(
      unitOfWork.execute(async (context) => {
        await context.membershipInvitationRepository.save(invitation);

        await context.membershipInvitationEmail.enqueueInvitationEmail(
          emailInput,
        );

        // Both writes have happened inside the transaction at this point.
        throw expectedError;
      }),
    ).rejects.toBe(expectedError);

    const persistedInvitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });

    const persistedEmail = await prisma.outboundEmailMessage.findUnique({
      where: {
        idempotencyKey,
      },
    });

    // Neither write should survive the rollback.
    expect(persistedInvitation).toBeNull();
    expect(persistedEmail).toBeNull();
  });
});
