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

function isDatabaseNotReachable(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const meta = error.meta;

  if (typeof meta !== 'object' || meta === null) {
    return false;
  }

  const driverAdapterError = (meta as Record<string, unknown>)
    .driverAdapterError;

  if (typeof driverAdapterError !== 'object' || driverAdapterError === null) {
    return false;
  }

  const cause = (driverAdapterError as Record<string, unknown>).cause;

  return (
    typeof cause === 'object' &&
    cause !== null &&
    'kind' in cause &&
    cause.kind === 'DatabaseNotReachable'
  );
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

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2010' &&
    isDatabaseNotReachable(error)
  ) {
    return new DependencyUnavailableError('P2010', error);
  }

  // Preserve unknown and unmapped errors for the outer error boundary.
  return error;
}
