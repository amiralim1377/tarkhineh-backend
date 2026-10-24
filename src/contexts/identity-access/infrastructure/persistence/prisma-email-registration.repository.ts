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
    const { user, tokenHash, expiresAt, encryptedPayload, now } = input;
    const email = user.email;
    const passwordHash = user.passwordHash;

    // This operation accepts only a new, pending email identity.
    // Validate its input before entering the Prisma error-normalization block.
    if (
      email === null ||
      email.trim().length === 0 ||
      passwordHash === null ||
      user.status !== 'PENDING' ||
      user.emailVerifiedAt !== null
    ) {
      throw new TypeError(
        'createPendingRegistration requires a pending email identity user.',
      );
    }

    if (typeof tokenHash !== 'string' || tokenHash.trim().length === 0) {
      throw new TypeError('Email verification token hash is invalid.');
    }

    if (
      typeof encryptedPayload !== 'string' ||
      encryptedPayload.trim().length === 0
    ) {
      throw new TypeError('Encrypted email verification payload is invalid.');
    }

    if (
      !(now instanceof Date) ||
      !Number.isFinite(now.getTime()) ||
      !(expiresAt instanceof Date) ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= now
    ) {
      throw new TypeError('Email verification timestamps are invalid.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Create the Outbound Email record through the same transaction
        // that creates the User and EmailVerificationChallenge.
        const enqueueVerificationEmail = async (
          challengeId: string,
        ): Promise<void> => {
          await tx.outboundEmailMessage.create({
            data: {
              idempotencyKey: `email-verification:${challengeId}`,
              lane: 'TRANSACTIONAL',
              templateKey: 'identity.email-verification',
              payloadVersion: 1,
              encryptedPayload,
              status: 'PENDING',
              availableAt: now,
              validUntil: expiresAt,
              aggregateType: 'EmailVerificationChallenge',
              aggregateId: challengeId,
            },
          });
        };

        const existingUser = await tx.user.findUnique({
          where: { email },
          select: {
            id: true,
          },
        });

        if (existingUser) {
          // Acquire the User lock before changing challenges or outbound
          // messages. This follows the lock order used by the email
          // verification and password-reset delivery flows.
          const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM public."User"
            WHERE "id" = ${existingUser.id}
            FOR UPDATE
          `;

          if (lockedUsers.length !== 1) {
            return false;
          }

          // Re-read the account after acquiring the lock. The state observed
          // by the initial lookup might have changed while waiting for it.
          const currentUser = await tx.user.findUnique({
            where: {
              id: existingUser.id,
            },
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              status: true,
            },
          });

          if (
            !currentUser ||
            currentUser.email !== email ||
            currentUser.emailVerifiedAt !== null ||
            currentUser.status !== 'PENDING'
          ) {
            // Keep the registration response independent of whether this
            // email belongs to an already verified or ineligible account.
            return false;
          }

          const previousChallenges =
            await tx.emailVerificationChallenge.findMany({
              where: {
                userId: currentUser.id,
                consumedAt: null,
              },
              select: {
                id: true,
              },
            });

          const previousChallengeIds = previousChallenges.map(
            (challenge) => challenge.id,
          );

          if (previousChallengeIds.length > 0) {
            // Cancel messages that have not entered the delivery-processing
            // stage. Do not forcibly cancel PROCESSING or OUTCOME_UNKNOWN:
            // the provider outcome may already be in progress or ambiguous.
            await tx.outboundEmailMessage.updateMany({
              where: {
                aggregateType: 'EmailVerificationChallenge',
                aggregateId: {
                  in: previousChallengeIds,
                },
                status: {
                  in: ['PENDING', 'DISPATCHING', 'QUEUED', 'RETRY_SCHEDULED'],
                },
              },
              data: {
                status: 'CANCELLED',
                cancelledAt: now,
                encryptedPayload: null,
                lockedBy: null,
                lockedUntil: null,
                lastErrorCode: 'CHALLENGE_INELIGIBLE',
                updatedAt: now,
              },
            });
          }

          // Invalidate previous verification links inside this transaction.
          await tx.emailVerificationChallenge.updateMany({
            where: {
              userId: currentUser.id,
              consumedAt: null,
            },
            data: {
              consumedAt: now,
            },
          });

          const challenge = await tx.emailVerificationChallenge.create({
            data: {
              userId: currentUser.id,
              email,
              tokenHash,
              expiresAt,
            },
            select: {
              id: true,
            },
          });

          // Persist the new challenge and its outbound email atomically.
          await enqueueVerificationEmail(challenge.id);

          return true;
        }

        // Persist the pending identity created by the Domain Entity.
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
            tokenHash,
            expiresAt,
          },
          select: {
            id: true,
          },
        });

        // User, Challenge, and Outbound Email commit or roll back together.
        await enqueueVerificationEmail(challenge.id);

        return true;
      });
    } catch (error: unknown) {
      if (isEmailUniqueConstraintError(error)) {
        // A concurrent registration may have inserted the same email
        // after the initial lookup. Preserve the anti-enumeration behavior.
        return false;
      }

      throw normalizePrismaError(error);
    }
  }
}
