import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import type { BranchRepository } from '../../application/ports/branch.repository.js';
import { BranchSlugAlreadyExistsError } from '../../application/errors/branch-slug-already-exists.error.js';
import type { Branch } from '../../domain/entities/branch.js';

@Injectable()
export class PrismaBranchRepository implements BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async existsBySlug(organizationId: string, slug: string): Promise<boolean> {
    try {
      const branch = await this.prisma.branch.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug,
          },
        },
        select: {
          id: true,
        },
      });

      return branch !== null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  async save(branch: Branch): Promise<void> {
    try {
      await this.prisma.branch.create({
        data: {
          id: branch.id,
          organizationId: branch.organizationId,
          nameFa: branch.nameFa,
          nameEn: branch.nameEn,
          slug: branch.slug,
          status: branch.status,
          phoneNumber: branch.phoneNumber,
          addressFa: branch.addressFa,
          addressEn: branch.addressEn,
          cityFa: branch.cityFa,
          cityEn: branch.cityEn,
          postalCode: branch.postalCode,
          countryCode: branch.countryCode,
          latitude: branch.latitude,
          longitude: branch.longitude,
          timeZoneId: branch.timeZoneId,
        },
      });
    } catch (error: unknown) {
      if (this.isBranchSlugUniqueConstraintError(error)) {
        throw new BranchSlugAlreadyExistsError(
          branch.organizationId,
          branch.slug,
        );
      }

      throw normalizePrismaError(error);
    }
  }

  private isBranchSlugUniqueConstraintError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.includes('organizationId') && target.includes('slug');
    }

    if (typeof target === 'string') {
      return target.includes('organizationId') && target.includes('slug');
    }

    return false;
  }
}
