import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { IdentityUser } from '../../domain/entities/identity-user.js';

import type {
  CreatePasswordResetRequestInput,
  PasswordResetRequestStore,
} from '../../application/ports/password-reset-request-store.port.js';

interface LockedUserRow {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

@Injectable()
export class PrismaPasswordResetRequestStore implements PasswordResetRequestStore {
  constructor(private readonly prisma: PrismaService) {}

  async createPasswordResetRequest(
    input: CreatePasswordResetRequestInput,
  ): Promise<void> {
    this.validateInput(input);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock the matching user row to serialize concurrent reset requests.
        const rows = await tx.$queryRaw<LockedUserRow[]>`
          SELECT
            "id",
            "email",
            "emailVerifiedAt",
            "passwordHash",
            "displayName",
            "status"
          FROM "User"
          WHERE "email" = ${input.email}
          FOR UPDATE
        `;

        const row = rows[0];

        if (!row) {
          return;
        }

        // Keep the password-login eligibility rule in the Domain Entity.
        const user = IdentityUser.reconstitute({
          id: row.id,
          email: row.email,
          emailVerifiedAt: row.emailVerifiedAt,
          passwordHash: row.passwordHash,
          displayName: row.displayName,
          status: row.status,
        });

        if (!user.canLoginWithPassword() || user.email === null) {
          return;
        }

        const previousChallenges = await tx.passwordResetChallenge.findMany({
          where: {
            userId: user.id,
            consumedAt: null,
            invalidatedAt: null,
          },
          select: {
            id: true,
          },
        });

        const previousChallengeIds = previousChallenges.map(
          (challenge) => challenge.id,
        );

        if (previousChallengeIds.length > 0) {
          // Invalidate previous tokens within the same transaction.
          await tx.passwordResetChallenge.updateMany({
            where: {
              id: { in: previousChallengeIds },
              consumedAt: null,
              invalidatedAt: null,
            },
            data: {
              invalidatedAt: input.now,
            },
          });

          // Cancel messages that have not entered active delivery processing.
          // A processing Worker must independently re-check its Challenge.
          await tx.outboundEmailMessage.updateMany({
            where: {
              aggregateType: 'PasswordResetChallenge',
              aggregateId: { in: previousChallengeIds },
              status: {
                in: ['PENDING', 'DISPATCHING', 'QUEUED', 'RETRY_SCHEDULED'],
              },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: input.now,
              encryptedPayload: null,
              lockedBy: null,
              lockedUntil: null,
              lastErrorCode: 'CHALLENGE_SUPERSEDED',
            },
          });

          // An unknown provider outcome must not be retried automatically.
          // The payload is no longer needed because the Challenge is invalid.
          await tx.outboundEmailMessage.updateMany({
            where: {
              aggregateType: 'PasswordResetChallenge',
              aggregateId: { in: previousChallengeIds },
              status: 'OUTCOME_UNKNOWN',
            },
            data: {
              encryptedPayload: null,
            },
          });
        }

        const challenge = await tx.passwordResetChallenge.create({
          data: {
            userId: user.id,
            email: user.email,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
          select: {
            id: true,
          },
        });

        // Challenge and Outbox are committed together.
        await tx.outboundEmailMessage.create({
          data: {
            idempotencyKey: `password-reset:${challenge.id}`,
            lane: 'TRANSACTIONAL',
            templateKey: 'identity.password-reset',
            payloadVersion: 1,
            encryptedPayload: input.encryptedPayload,
            status: 'PENDING',
            availableAt: input.now,
            validUntil: input.expiresAt,
            aggregateType: 'PasswordResetChallenge',
            aggregateId: challenge.id,
          },
        });
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }

  private validateInput(input: CreatePasswordResetRequestInput): void {
    if (!input.email.trim()) {
      throw new TypeError('Password reset email must not be empty.');
    }

    if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) {
      throw new TypeError('Password reset token hash is invalid.');
    }

    if (!input.encryptedPayload.trim()) {
      throw new TypeError('Password reset payload must be encrypted.');
    }

    if (
      !Number.isFinite(input.now.getTime()) ||
      !Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt <= input.now
    ) {
      throw new RangeError('Password reset expiration dates are invalid.');
    }
  }
}
