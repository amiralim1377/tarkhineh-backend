import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import { IdentityUser } from '../../domain/entities/identity-user.js';

import {
  OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
  type OutboundEmailPayloadEncryptor,
} from '../../../outbound-email/application/ports/outbound-email-payload-encryptor.port.js';

import type {
  EmailVerificationCompletionInput,
  EmailVerificationCompletionStore,
} from '../../application/ports/email-verification-completion-store.port.js';

interface EmailVerificationCandidateRow {
  id: string;
  userId: string;
}

interface LockedEmailVerificationUserRow {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

interface LockedEmailVerificationChallengeRow {
  id: string;
  userId: string;
  email: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

class VerificationStateChangedError extends Error {
  constructor() {
    super('Email verification state changed.');
    this.name = 'VerificationStateChangedError';
  }
}

const WELCOME_TEMPLATE_KEY = 'identity.welcome';
const WELCOME_TEMPLATE_VERSION = 1;

@Injectable()
export class PrismaEmailVerificationCompletionStore implements EmailVerificationCompletionStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR)
    private readonly payloadEncryptor: OutboundEmailPayloadEncryptor,
  ) {}

  private validateInput(input: EmailVerificationCompletionInput): void {
    if (!input.tokenHash.trim()) {
      throw new TypeError('Email verification token hash must not be empty.');
    }

    if (!Number.isFinite(input.now.getTime())) {
      throw new RangeError('Email verification timestamp is invalid.');
    }
  }

  async completeEmailVerification(
    input: EmailVerificationCompletionInput,
  ): Promise<boolean> {
    this.validateInput(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Find the candidate challenge without locking it yet.
        const candidate = await tx.emailVerificationChallenge.findUnique({
          where: {
            tokenHash: input.tokenHash,
          },
          select: {
            id: true,
            userId: true,
          },
        });

        if (!candidate) {
          return false;
        }

        // 2. Lock the User first to preserve the established lock order.
        const userRows = await tx.$queryRaw<LockedEmailVerificationUserRow[]>`
            SELECT
              "id",
              "email",
              "emailVerifiedAt",
              "passwordHash",
              "displayName",
              "status"
            FROM "User"
            WHERE "id" = ${candidate.userId}
            FOR UPDATE
          `;

        const user = userRows[0];

        if (!user || !user.email) {
          return false;
        }

        // 3. Lock and re-read the challenge after locking the User.
        const challengeRows = await tx.$queryRaw<
          LockedEmailVerificationChallengeRow[]
        >`
            SELECT
              "id",
              "userId",
              "email",
              "expiresAt",
              "consumedAt"
            FROM "EmailVerificationChallenge"
            WHERE "id" = ${candidate.id}
              AND "tokenHash" = ${input.tokenHash}
            FOR UPDATE
          `;

        const challenge = challengeRows[0];

        if (
          !challenge ||
          challenge.userId !== user.id ||
          challenge.consumedAt !== null ||
          challenge.expiresAt <= input.now ||
          challenge.email !== user.email
        ) {
          return false;
        }

        // 4. Reconstruct the Domain Entity.
        const identityUser = IdentityUser.reconstitute({
          id: user.id,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          status: user.status,
        });

        // The Domain Entity owns the email-verification state transition.
        if (!identityUser.verifyEmail(input.now)) {
          return false;
        }

        const verifiedAt = identityUser.emailVerifiedAt;

        if (identityUser.status !== 'ACTIVE' || verifiedAt === null) {
          return false;
        }

        // 5. Consume the challenge conditionally.
        const consumed = await tx.emailVerificationChallenge.updateMany({
          where: {
            id: challenge.id,
            userId: identityUser.id,
            tokenHash: input.tokenHash,
            consumedAt: null,
            expiresAt: {
              gt: input.now,
            },
          },
          data: {
            consumedAt: input.now,
          },
        });

        if (consumed.count !== 1) {
          return false;
        }

        // 6. Activate the account only if it is still pending and unverified.
        const activated = await tx.user.updateMany({
          where: {
            id: identityUser.id,
            status: 'PENDING',
            emailVerifiedAt: null,
            email: challenge.email,
          },
          data: {
            status: identityUser.status,
            emailVerifiedAt: verifiedAt,
          },
        });

        if (activated.count !== 1) {
          // Throwing forces the transaction to roll back challenge consumption.
          throw new VerificationStateChangedError();
        }

        // 7. Encrypt the welcome-email payload.
        const encryptedPayload = this.payloadEncryptor.encrypt(
          JSON.stringify({
            email: user.email,
          }),
        );

        // 8. Create the welcome notification in the same transaction.
        await tx.outboundEmailMessage.create({
          data: {
            idempotencyKey: `welcome:user:${identityUser.id}`,
            lane: 'TRANSACTIONAL',
            templateKey: WELCOME_TEMPLATE_KEY,
            payloadVersion: WELCOME_TEMPLATE_VERSION,
            encryptedPayload,
            status: 'PENDING',
            availableAt: input.now,
            aggregateType: 'User',
            aggregateId: identityUser.id,
          },
        });

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
