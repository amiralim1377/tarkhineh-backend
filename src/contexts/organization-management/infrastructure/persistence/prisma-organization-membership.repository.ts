import { Injectable } from '@nestjs/common';
import type { OrganizationMembershipPort } from '../../application/ports/organization-membership.port.js';
import { OrganizationMembership } from '../../domain/entities/organization-membership.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { OrganizationMembershipAlreadyExistsError } from '../../application/errors/organization-membership-already-exists.error.js';
import { Prisma } from '../../../../generated/prisma/client.js';

type OrganizationMembershipPrismaClient = Pick<
  Prisma.TransactionClient,
  'organizationMembership'
>;

@Injectable()
export class PrismaOrganizationMembershipRepository implements OrganizationMembershipPort {
  constructor(private readonly prisma: OrganizationMembershipPrismaClient) {}

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
    } catch (error: unknown) {
      if (this.isOrganizationMembershipUniqueConstraintError(error)) {
        throw new OrganizationMembershipAlreadyExistsError();
      }

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
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private isOrganizationMembershipUniqueConstraintError(
    error: unknown,
  ): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.includes('organizationId') && target.includes('userId');
    }

    if (typeof target === 'string') {
      return target.includes('organizationId') && target.includes('userId');
    }

    return false;
  }
}
