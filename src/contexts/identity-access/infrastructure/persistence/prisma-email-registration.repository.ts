import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type {
  CreatePendingEmailRegistration,
  EmailRegistrationRepository,
} from '../../domain/ports/email-registration.repository.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

function isEmailUniqueConstraintError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;

  return (
    (Array.isArray(target) && target.length === 1 && target[0] === 'email') ||
    target === 'email' ||
    target === 'User_email_key'
  );
}
@Injectable()
export class PrismaEmailRegistrationRepository implements EmailRegistrationRepository {
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
      if (isEmailUniqueConstraintError(error)) {
        return false;
      }

      throw normalizePrismaError(error);
    }
  }
}
