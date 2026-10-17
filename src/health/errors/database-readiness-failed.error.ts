import { ApplicationError } from '../../shared/application/errors/application-error.js';
import { ERROR_CATEGORY } from '../../shared/errors/error-category.js';

function getSafeErrorType(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return 'UnknownError';
  }

  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(cause.name)
    ? cause.name
    : 'UnknownError';
}

export class DatabaseReadinessFailedError extends ApplicationError {
  readonly code = 'COMMON.DEPENDENCY_UNAVAILABLE';
  override readonly category = ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE;

  constructor(cause: unknown) {
    super('Database readiness check failed', {
      cause,
      metadata: {
        dependency: 'postgresql',
        operation: 'readiness-check',
        diagnosticType: getSafeErrorType(cause),
      },
    });
  }
}
