import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import type { AccessTokenIdentityReader } from '../../application/ports/access-token-identity-reader.port.js';

@Injectable()
export class PrismaAccessTokenIdentityReader
  implements AccessTokenIdentityReader
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          status: true,
          emailVerifiedAt: true,
        },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
      };
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
