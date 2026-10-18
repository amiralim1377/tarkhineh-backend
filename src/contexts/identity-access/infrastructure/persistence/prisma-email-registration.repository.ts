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
    const { user } = input;
    const email = user.email;
    const passwordHash = user.passwordHash;

    // This repository operation accepts only a new, pending email identity.
    // Keep this guard outside the Prisma error-normalization block.
    if (
      email === null ||
      email.trim().length === 0 ||
      passwordHash === null ||
      user.status !== 'PENDING' ||
      user.emailVerifiedAt !== null
    ) {
      throw new Error(
        'createPendingRegistration requires a pending email identity user.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { email },
          select: {
            id: true,
            emailVerifiedAt: true,
            status: true,
          },
        });

        if (existingUser) {
          // Keep the existing anti-enumeration behavior:
          // verified or non-pending accounts do not get a new challenge.
          if (
            existingUser.emailVerifiedAt !== null ||
            existingUser.status !== 'PENDING'
          ) {
            return false;
          }

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

          // Cancel pending jobs that belong to the old challenges.
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

          // Invalidate any old verification links.
          await tx.emailVerificationChallenge.updateMany({
            where: {
              userId: existingUser.id,
              consumedAt: null,
            },
            data: {
              consumedAt: new Date(),
            },
          });

          const challenge = await tx.emailVerificationChallenge.create({
            data: {
              userId: existingUser.id,
              email,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
            select: {
              id: true,
            },
          });

          // The challenge and email job are committed together.
          await tx.emailOutboxMessage.create({
            data: {
              challengeId: challenge.id,
              encryptedToken: input.encryptedToken,
            },
          });

          return true;
        }

        // Persist the identity created by the Domain Entity.
        // The ID and initial status are no longer independently chosen here.
        const createdUser = await tx.user.create({
          data: {
            id: user.id,
            email,
            passwordHash,
            displayName: user.displayName,
            status: user.status,
          },
          select: {
            id: true,
          },
        });

        const challenge = await tx.emailVerificationChallenge.create({
          data: {
            userId: createdUser.id,
            email,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
          select: {
            id: true,
          },
        });

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
