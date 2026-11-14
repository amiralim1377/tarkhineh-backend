import { Injectable } from '@nestjs/common';
import type { OrganizationMembershipPort } from '../../application/ports/organization-membership.port.js';
import { OrganizationMembership } from '../../domain/entities/organization-membership.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

@Injectable()
export class PrismaOrganizationMembershipRepository implements OrganizationMembershipPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    organizationId: string,
    membershipId: string,
  ): Promise<OrganizationMembership | null> {
    const membership = await this.prisma.organizationMembership
      .findUnique({
        where: {
          id_organizationId: {
            id: membershipId,
            organizationId,
          },
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!membership) {
      return null;
    }

    return OrganizationMembership.reconstitute(membership);
  }

  async findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const membership = await this.prisma.organizationMembership
      .findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!membership) {
      return null;
    }

    return OrganizationMembership.reconstitute(membership);
  }

  async save(membership: OrganizationMembership): Promise<void> {
    try {
      await this.prisma.organizationMembership.create({
        data: {
          id: membership.id,
          organizationId: membership.organizationId,
          userId: membership.userId,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }
  }

  async update(membership: OrganizationMembership): Promise<void> {
    try {
      await this.prisma.organizationMembership.update({
        where: {
          id_organizationId: {
            id: membership.id,
            organizationId: membership.organizationId,
          },
        },
        data: {
          status: membership.status,
          updatedAt: membership.updatedAt,
        },
      });
    } catch (error) {
      throw normalizePrismaError(error);
    }
  }
}
