import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { IdentityAccessUserLookup } from '../../contracts/user-lookup.contract.js';
import type { IdentityAccessUserStatus } from '../../contracts/user-lookup.contract.js';

@Injectable()
export class PrismaIdentityAccessUserLookup implements IdentityAccessUserLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findStatusById(
    userId: string,
  ): Promise<IdentityAccessUserStatus | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          status: true,
        },
      });

      return user?.status ?? null;
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
