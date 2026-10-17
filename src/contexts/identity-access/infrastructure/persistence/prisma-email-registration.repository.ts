import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import type {
  CreatePendingEmailRegistration,
  EmailRegistrationRepository,
} from '../../domain/ports/email-registration.repository.js';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PrismaEmailRegistrationRepository
  implements EmailRegistrationRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async createPendingRegistration(
    input: CreatePendingEmailRegistration,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { email: input.email },
          select: {
            id: true,
            emailVerifiedAt: true,
            status: true,
          },
        });

        if (existingUser) {
          if (
            existingUser.emailVerifiedAt !== null ||
            existingUser.status !== 'PENDING'
          ) {
            return false;
          }

          await tx.emailVerificationChallenge.updateMany({
            where: {
              userId: existingUser.id,
              consumedAt: null,
            },
            data: {
              consumedAt: new Date(),
            },
          });

          await tx.emailVerificationChallenge.create({
            data: {
              userId: existingUser.id,
              email: input.email,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
          });

          return true;
        }

        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
            status: 'PENDING',
          },
          select: { id: true },
        });

        await tx.emailVerificationChallenge.create({
          data: {
            userId: user.id,
            email: input.email,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
        });

        return true;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        return false;
      }

      throw error;
    }
  }
}
