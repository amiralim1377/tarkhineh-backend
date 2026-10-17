import { Prisma } from '../../generated/prisma/client.js';
import { DependencyUnavailableError } from '../../shared/application/errors/dependency-unavailable.error.js';

const DEPENDENCY_UNAVAILABLE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2037',
]);

const DRIVER_CONNECTIVITY_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
]);

function findDriverConnectivityCode(
  error: unknown,
  depth = 0,
): string | undefined {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return undefined;
  }

  if (
    'code' in error &&
    typeof error.code === 'string' &&
    DRIVER_CONNECTIVITY_CODES.has(error.code)
  ) {
    return error.code;
  }

  if ('cause' in error) {
    return findDriverConnectivityCode(error.cause, depth + 1);
  }

  return undefined;
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode ?? findDriverConnectivityCode(error);
  }

  // Some driver failures may surface as native Node.js errors.
  return findDriverConnectivityCode(error);
}

export function normalizePrismaError(error: unknown): unknown {
  const code = getPrismaErrorCode(error);

  if (
    code &&
    (DEPENDENCY_UNAVAILABLE_CODES.has(code) ||
      DRIVER_CONNECTIVITY_CODES.has(code))
  ) {
    return new DependencyUnavailableError(code, error);
  }

  // Preserve all unrecognized errors for the outer error boundary.
  return error;
}
