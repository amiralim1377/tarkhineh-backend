import { Injectable } from '@nestjs/common';
import { MembershipInvitation } from '../../domain/entities/membership-invitation.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { MembershipInvitationPort } from '../../application/ports/membership-invitation.port.js';
import type { MembershipInvitationScope } from '../../domain/types/membership-invitation-scope.js';
import type { MembershipInvitationStatus } from '../../domain/types/membership-invitation-status.js';
import type { MembershipInvitationModel as PrismaMembershipInvitation } from '../../../../generated/prisma/models/MembershipInvitation.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { MembershipInvitationAlreadyExistsError } from '../../application/errors/membership-invitation-already-exists.error.js';

const PENDING_INVITATION_UNIQUE_INDEXES = new Set([
  'MembershipInvitation_pending_organization_email_key',
  'MembershipInvitation_pending_branch_email_key',
]);

type MembershipInvitationPrismaClient = Pick<
  Prisma.TransactionClient,
  'membershipInvitation'
>;

@Injectable()
export class PrismaMembershipInvitationRepository implements MembershipInvitationPort {
  constructor(private readonly prisma: MembershipInvitationPrismaClient) {}

  async findById(
    organizationId: string,
    invitationId: string,
  ): Promise<MembershipInvitation | null> {
    const invitation = await this.prisma.membershipInvitation
      .findUnique({
        where: {
          id: invitationId,
          organizationId,
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!invitation) {
      return null;
    }

    return this.toDomain(invitation);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<MembershipInvitation | null> {
    const invitation = await this.prisma.membershipInvitation
      .findUnique({
        where: {
          tokenHash,
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!invitation) {
      return null;
    }

    return this.toDomain(invitation);
  }

  async findPendingByBranchAndEmail(
    organizationId: string,
    branchId: string,
    email: string,
  ): Promise<MembershipInvitation | null> {
    const invitation = await this.prisma.membershipInvitation
      .findFirst({
        where: {
          organizationId,
          branchId,
          email: email.trim().toLowerCase(),
          scope: 'BRANCH',
          status: 'PENDING',
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!invitation) {
      return null;
    }

    return this.toDomain(invitation);
  }

  async findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
  ): Promise<MembershipInvitation | null> {
    const invitation = await this.prisma.membershipInvitation
      .findFirst({
        where: {
          organizationId,
          email: email.trim().toLowerCase(),
          scope: 'ORGANIZATION',
          status: 'PENDING',
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!invitation) {
      return null;
    }

    return this.toDomain(invitation);
  }

  async save(invitation: MembershipInvitation): Promise<void> {
    try {
      await this.prisma.membershipInvitation.create({
        data: {
          id: invitation.id,
          organizationId: invitation.organizationId,
          branchId: invitation.branchId,
          email: invitation.email,
          inviterUserId: invitation.inviterUserId,
          tokenHash: invitation.tokenHash,
          scope: invitation.scope,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          acceptedAt: invitation.acceptedAt,
          createdAt: invitation.createdAt,
          updatedAt: invitation.updatedAt,
        },
      });
    } catch (error) {
      if (this.isPendingInvitationUniqueConstraintError(error)) {
        throw new MembershipInvitationAlreadyExistsError();
      }
      throw normalizePrismaError(error);
    }
  }

  async update(invitation: MembershipInvitation): Promise<void> {
    try {
      await this.prisma.membershipInvitation.update({
        where: {
          id: invitation.id,
          organizationId: invitation.organizationId,
        },
        data: {
          status: invitation.status,
          acceptedAt: invitation.acceptedAt,
          updatedAt: invitation.updatedAt,
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }
  }

  private toDomain(
    invitation: PrismaMembershipInvitation,
  ): MembershipInvitation {
    return MembershipInvitation.reconstitute({
      id: invitation.id,
      organizationId: invitation.organizationId,
      branchId: invitation.branchId,
      email: invitation.email,
      inviterUserId: invitation.inviterUserId,
      tokenHash: invitation.tokenHash,
      scope: invitation.scope as MembershipInvitationScope,
      status: invitation.status as MembershipInvitationStatus,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
    });
  }

  private isPendingInvitationUniqueConstraintError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const meta = this.asRecord(error.meta);

    const driverAdapterError = this.asRecord(meta?.driverAdapterError);

    const cause = this.asRecord(driverAdapterError?.cause);

    const constraint = this.asRecord(cause?.constraint);

    const candidates: unknown[] = [
      meta?.target,
      constraint?.index,
      constraint?.fields,
      cause?.originalMessage,
      cause?.message,
      error.message,
    ];

    return candidates.some((candidate) =>
      this.containsPendingInvitationIndexName(candidate),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private containsPendingInvitationIndexName(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((item) =>
        this.containsPendingInvitationIndexName(item),
      );
    }

    if (typeof value !== 'string') {
      return false;
    }

    return [...PENDING_INVITATION_UNIQUE_INDEXES].some((indexName) =>
      value.includes(indexName),
    );
  }
}
