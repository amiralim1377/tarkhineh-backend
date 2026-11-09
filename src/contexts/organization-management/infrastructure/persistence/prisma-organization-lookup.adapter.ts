import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import type { OrganizationLookupPort } from '../../application/ports/organization-lookup.port.js';
import type { OrganizationStatus } from '../../contracts/lifecycle-status.contract.js';

@Injectable()
export class PrismaOrganizationLookupAdapter implements OrganizationLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async findStatusById(
    organizationId: string,
  ): Promise<OrganizationStatus | null> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          status: true,
        },
      });

      return organization?.status ?? null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
