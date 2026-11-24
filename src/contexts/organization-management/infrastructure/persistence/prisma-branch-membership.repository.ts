import { Injectable } from '@nestjs/common';
import type { BranchMembershipPort } from '../../application/ports/branch-membership.port.js';
import { BranchMembership } from '../../domain/entities/branch-membership.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { BranchMembershipAlreadyExistsError } from '../../application/errors/branch-membership-already-exists.error.js';
import { Prisma } from '../../../../generated/prisma/client.js';

type BranchMembershipPrismaClient = Pick<
  Prisma.TransactionClient,
  'branchMembership'
>;

@Injectable()
export class PrismaBranchMembershipRepository implements BranchMembershipPort {
  constructor(private readonly prisma: BranchMembershipPrismaClient) {}

  async findById(
    organizationId: string,
    membershipId: string,
  ): Promise<BranchMembership | null> {
    const membership = await this.prisma.branchMembership
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

    return BranchMembership.reconstitute(membership);
  }

  async findByBranchAndOrganizationMembership(
    organizationId: string,
    branchId: string,
    organizationMembershipId: string,
  ): Promise<BranchMembership | null> {
    const membership = await this.prisma.branchMembership
      .findFirst({
        where: {
          organizationId,
          branchId,
          organizationMembershipId,
        },
      })
      .catch((error: unknown) => {
        throw normalizePrismaError(error);
      });

    if (!membership) {
      return null;
    }

    return BranchMembership.reconstitute(membership);
  }

  async save(membership: BranchMembership): Promise<void> {
    try {
      await this.prisma.branchMembership.create({
        data: {
          id: membership.id,
          organizationId: membership.organizationId,
          branchId: membership.branchId,
          organizationMembershipId: membership.organizationMembershipId,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        },
      });
    } catch (error: unknown) {
      if (this.isBranchMembershipUniqueConstraintError(error)) {
        throw new BranchMembershipAlreadyExistsError();
      }

      throw normalizePrismaError(error);
    }
  }

  async update(membership: BranchMembership): Promise<void> {
    try {
      await this.prisma.branchMembership.update({
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

  private isBranchMembershipUniqueConstraintError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return (
        target.includes('branchId') &&
        target.includes('organizationMembershipId')
      );
    }

    if (typeof target === 'string') {
      return (
        target.includes('branchId') &&
        target.includes('organizationMembershipId')
      );
    }

    return false;
  }
}
