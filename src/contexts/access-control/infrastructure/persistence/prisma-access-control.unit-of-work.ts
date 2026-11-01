import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { normalizePrismaError } from '../../../../prisma/errors/prisma-error-translator.js';
import type { AccessControlUnitOfWork } from '../../application/ports/access-control-unit-of-work.port.js';
import type { AccessControlUnitOfWorkContext } from '../../application/ports/access-control-unit-of-work.port.js';
import { PrismaAuthorizationSnapshotReader } from './prisma-authorization-snapshot.reader.js';
import { PrismaPermissionOverrideRepository } from './prisma-permission-override.repository.js';
import { PrismaRoleAssignmentRepository } from './prisma-role-assignment.repository.js';
import { PrismaRoleRepository } from './prisma-role.repository.js';
import { RetryableAccessControlTransactionError } from './retryable-access-control-transaction.error.js';

const MAX_TRANSACTION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 20;

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

function createTransactionContext(
  tx: Prisma.TransactionClient,
): AccessControlUnitOfWorkContext {
  return {
    authorizationSnapshotReader: new PrismaAuthorizationSnapshotReader(tx),
    roleRepository: new PrismaRoleRepository(tx),
    roleAssignmentRepository: new PrismaRoleAssignmentRepository(tx),
    permissionOverrideRepository: new PrismaPermissionOverrideRepository(tx),
  };
}

@Injectable()
export class PrismaAccessControlUnitOfWork implements AccessControlUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    operation: (context: AccessControlUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => operation(createTransactionContext(tx)),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error: unknown) {
        const isRetryableConflict =
          isSerializationConflict(error) ||
          error instanceof RetryableAccessControlTransactionError;

        if (!isRetryableConflict || attempt === MAX_TRANSACTION_ATTEMPTS) {
          const originalError =
            error instanceof RetryableAccessControlTransactionError
              ? error.originalError
              : error;

          throw normalizePrismaError(originalError);
        }

        // The complete operation is retried because PostgreSQL may report
        // a serialization conflict at commit time, after the callback ran.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, RETRY_DELAY_MS * attempt);
        });
      }
    }

    throw new Error(
      'Access Control transaction retry loop terminated unexpectedly.',
    );
  }
}
