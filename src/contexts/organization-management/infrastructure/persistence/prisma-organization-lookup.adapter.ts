import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { OrganizationLookupPort } from '../../application/ports/organization-lookup.port.js';

@Injectable()
export class PrismaOrganizationLookupAdapter implements OrganizationLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async existsById(organizationId: string): Promise<boolean> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          id: true,
        },
      });

      return organization !== null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
