import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';

import {
  OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
  type OutboundEmailPayloadEncryptor,
} from '../../../outbound-email/application/ports/outbound-email-payload-encryptor.port.js';

import type {
  PasswordChangeStore,
  PasswordChangeStoreInput,
} from '../../application/ports/password-change-store.port.js';

interface LockedPasswordChangeUserRow {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

const PASSWORD_CHANGED_TEMPLATE_KEY = 'identity.password-changed';
const PASSWORD_CHANGED_TEMPLATE_VERSION = 1;

@Injectable()
export class PrismaPasswordChangeStore implements PasswordChangeStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR)
    private readonly payloadEncryptor: OutboundEmailPayloadEncryptor,
  ) {}

  private validateInput(input: PasswordChangeStoreInput): void {
    if (!input.userId.trim()) {
      throw new TypeError('Password change user ID must not be empty.');
    }

    if (!input.currentPasswordHash.trim()) {
      throw new TypeError('Current password hash must not be empty.');
    }

    if (!input.newPasswordHash.trim()) {
      throw new TypeError('New password hash must not be empty.');
    }

    if (!input.operationId.trim()) {
      throw new TypeError('Password change operation ID must not be empty.');
    }

    if (!Number.isFinite(input.now.getTime())) {
      throw new RangeError('Password change timestamp is invalid.');
    }
  }

  async changePasswordAndEnqueueNotification(
    input: PasswordChangeStoreInput,
  ): Promise<boolean> {
    this.validateInput(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Lock the user and read the latest security-relevant state.
        const userRows = await tx.$queryRaw<LockedPasswordChangeUserRow[]>`
          SELECT
            "id",
            "email",
            "emailVerifiedAt",
            "passwordHash",
            "status"
          FROM "User"
          WHERE "id" = ${input.userId}
          FOR UPDATE
        `;

        const user = userRows[0];

        // Revalidate the conditions previously checked by the Handler.
        if (
          !user ||
          user.passwordHash !== input.currentPasswordHash ||
          user.status !== 'ACTIVE' ||
          user.emailVerifiedAt === null ||
          !user.email
        ) {
          return false;
        }

        // 2. Update only if the expected password hash still matches.
        const passwordUpdated = await tx.user.updateMany({
          where: {
            id: input.userId,
            passwordHash: input.currentPasswordHash,
            status: 'ACTIVE',
            emailVerifiedAt: {
              not: null,
            },
          },
          data: {
            passwordHash: input.newPasswordHash,
          },
        });

        if (passwordUpdated.count !== 1) {
          return false;
        }

        // 3. Revoke active sessions.
        await tx.authSession.updateMany({
          where: {
            userId: input.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: input.now,
            revocationReason: 'SECURITY_ACTION',
          },
        });

        // 4. Revoke refresh tokens belonging to the user's sessions.
        await tx.refreshToken.updateMany({
          where: {
            revokedAt: null,
            session: {
              is: {
                userId: input.userId,
              },
            },
          },
          data: {
            revokedAt: input.now,
          },
        });

        // 5. Encrypt the payload before storing it in the Outbox.
        const encryptedPayload = this.payloadEncryptor.encrypt(
          JSON.stringify({
            email: user.email,
          }),
        );

        // 6. Enqueue the notification inside the same transaction.
        await tx.outboundEmailMessage.create({
          data: {
            idempotencyKey: `password-changed:change:${input.operationId}`,
            lane: 'TRANSACTIONAL',
            templateKey: PASSWORD_CHANGED_TEMPLATE_KEY,
            payloadVersion: PASSWORD_CHANGED_TEMPLATE_VERSION,
            encryptedPayload,
            status: 'PENDING',
            availableAt: input.now,
            aggregateType: 'User',
            aggregateId: user.id,
          },
        });

        return true;
      });
    } catch (error: unknown) {
      throw normalizePrismaError(error);
    }
  }
}
