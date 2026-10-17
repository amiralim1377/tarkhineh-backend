import { Prisma } from '../../generated/prisma/client.js';
import { DependencyUnavailableError } from '../../shared/application/errors/dependency-unavailable.error.js';

const DEPENDENCY_UNAVAILABLE_CODES = new Set([
  'P1001', // Cannot reach database server
  'P1002', // Database connection timed out
  'P1017', // Database server closed the connection
  'P2024', // Connection pool timeout
  'P2037', // Too many database connections
]);

function getPrismaErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode ?? undefined;
  }

  return undefined;
}

export function normalizePrismaError(error: unknown): unknown {
  const code = getPrismaErrorCode(error);

  if (code && DEPENDENCY_UNAVAILABLE_CODES.has(code)) {
    return new DependencyUnavailableError(code, error);
  }

  // Unknown and unmapped errors retain their original identity.
  return error;
}
