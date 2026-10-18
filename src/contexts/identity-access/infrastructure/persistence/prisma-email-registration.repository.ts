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

          // Find the existing, unconsumed challenges for this user.
          const previousChallenges =
            await tx.emailVerificationChallenge.findMany({
              where: {
                userId: existingUser.id,
                consumedAt: null,
              },
              select: {
                id: true,
              },
            });

          const previousChallengeIds = previousChallenges.map(
            (challenge) => challenge.id,
          );

          // Cancel pending jobs associated with old challenges.
          // The worker must also check this status before sending.
          if (previousChallengeIds.length > 0) {
            await tx.emailOutboxMessage.updateMany({
              where: {
                challengeId: {
                  in: previousChallengeIds,
                },
                status: {
                  in: ['PENDING', 'QUEUED'],
                },
              },
              data: {
                status: 'CANCELLED',
                encryptedToken: null,
              },
            });
          }

          // Invalidate the previous verification links.
          await tx.emailVerificationChallenge.updateMany({
            where: {
              userId: existingUser.id,
              consumedAt: null,
            },
            data: {
              consumedAt: new Date(),
            },
          });

          // Create a new verification challenge.
          const challenge = await tx.emailVerificationChallenge.create({
            data: {
              userId: existingUser.id,
              email: input.email,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
            select: {
              id: true,
            },
          });

          // Save the email job in the same database transaction.
          await tx.emailOutboxMessage.create({
            data: {
              challengeId: challenge.id,
              encryptedToken: input.encryptedToken,
            },
          });

          return true;
        }

        // Create a new user.
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
            status: 'PENDING',
          },
          select: {
            id: true,
          },
        });

        // Create the verification challenge.
        const challenge = await tx.emailVerificationChallenge.create({
          data: {
            userId: user.id,
            email: input.email,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
          select: {
            id: true,
          },
        });

        // Store the email job atomically with the user and challenge.
        await tx.emailOutboxMessage.create({
          data: {
            challengeId: challenge.id,
            encryptedToken: input.encryptedToken,
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
