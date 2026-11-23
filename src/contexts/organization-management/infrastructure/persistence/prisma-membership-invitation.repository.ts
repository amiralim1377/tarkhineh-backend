import { Injectable } from '@nestjs/common';
import { MembershipInvitation } from '../../domain/entities/membership-invitation.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { MembershipInvitationPort } from '../../application/ports/membership-invitation.port.js';
import type { MembershipInvitationScope } from '../../domain/types/membership-invitation-scope.js';
import type { MembershipInvitationStatus } from '../../domain/types/membership-invitation-status.js';
import type { MembershipInvitationModel as PrismaMembershipInvitation } from '../../../../generated/prisma/models/MembershipInvitation.js';

@Injectable()
export class PrismaMembershipInvitationRepository implements MembershipInvitationPort {
  constructor(private readonly prisma: PrismaService) {}

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
}
