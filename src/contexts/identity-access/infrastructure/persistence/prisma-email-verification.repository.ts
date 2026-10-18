import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
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
                email: true,
                emailVerifiedAt: true,
                status: true,
              },
            },
          },
        });

        if (
          !challenge ||
          challenge.consumedAt !== null ||
          challenge.expiresAt <= now ||
          challenge.user.emailVerifiedAt !== null ||
          challenge.user.status !== 'PENDING' ||
          challenge.user.email !== challenge.email
        ) {
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

        // Activate the account only if it is still pending and unverified.
        const activated = await tx.user.updateMany({
          where: {
            id: challenge.userId,
            status: 'PENDING',
            emailVerifiedAt: null,
            email: challenge.email,
          },
          data: {
            status: 'ACTIVE',
            emailVerifiedAt: now,
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
