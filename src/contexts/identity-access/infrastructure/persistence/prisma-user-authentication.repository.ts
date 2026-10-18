import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { IdentityUser } from '../../domain/entities/identity-user.js';
import type { UserAuthenticationRepository } from '../../domain/ports/user-authentication.repository.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

@Injectable()
export class PrismaUserAuthenticationRepository implements UserAuthenticationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<IdentityUser | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          passwordHash: true,
          displayName: true,
          status: true,
        },
      });

      if (!user) {
        return null;
      }

      return IdentityUser.reconstitute({
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        status: user.status,
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
