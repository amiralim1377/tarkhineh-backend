import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { IdentityUser } from '../../domain/entities/identity-user.js';
import type { EmailVerificationRepository } from '../../domain/ports/email-verification.repository.js';

class VerificationStateChangedError extends Error {
  constructor() {
    super('Email verification state changed');
    this.name = 'VerificationStateChangedError';
  }
}

@Injectable()
export class PrismaEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async verifyByTokenHash(
    tokenHash: string,
    now = new Date(),
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const challenge = await tx.emailVerificationChallenge.findUnique({
          where: { tokenHash },
          select: {
            id: true,
            userId: true,
            email: true,
            expiresAt: true,
            consumedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                emailVerifiedAt: true,
                passwordHash: true,
                displayName: true,
                status: true,
              },
            },
          },
        });

        // The token must exist, be unused and not be expired.
        // The challenge email must also match the user's current email.
        if (
          !challenge ||
          challenge.consumedAt !== null ||
          challenge.expiresAt <= now ||
          challenge.user.email !== challenge.email
        ) {
          return false;
        }

        // Reconstruct the Domain Entity from the persisted user.
        const user = IdentityUser.reconstitute({
          id: challenge.user.id,
          email: challenge.user.email,
          emailVerifiedAt: challenge.user.emailVerifiedAt,
          passwordHash: challenge.user.passwordHash,
          displayName: challenge.user.displayName,
          status: challenge.user.status,
        });

        // The Domain Entity owns the rule for the state transition.
        if (!user.verifyEmail(now)) {
          return false;
        }

        const verifiedAt = user.emailVerifiedAt;

        // Keep the persistence boundary defensive.
        if (user.status !== 'ACTIVE' || verifiedAt === null) {
          return false;
        }

        // Atomically consume the challenge. Only one request can win.
        const consumed = await tx.emailVerificationChallenge.updateMany({
          where: {
            id: challenge.id,
            tokenHash,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            consumedAt: now,
          },
        });

        if (consumed.count !== 1) {
          return false;
        }

        // Persist the Domain Entity's verified state only if the database
        // still contains the expected pending, unverified account.
        const activated = await tx.user.updateMany({
          where: {
            id: user.id,
            status: 'PENDING',
            emailVerifiedAt: null,
            email: challenge.email,
          },
          data: {
            status: user.status,
            emailVerifiedAt: verifiedAt,
          },
        });

        if (activated.count !== 1) {
          // Roll back challenge consumption if account activation lost a race.
          throw new VerificationStateChangedError();
        }

        return true;
      });
    } catch (error: unknown) {
      if (error instanceof VerificationStateChangedError) {
        return false;
      }

      throw normalizePrismaError(error);
    }
  }
}
