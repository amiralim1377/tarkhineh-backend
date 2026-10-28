import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { ApplicationError } from './application-error.js';

export type RateLimitStoreOperation = 'increment' | 'readiness-check';

export class RateLimitStoreUnavailableError extends ApplicationError {
  readonly code = 'COMMON.DEPENDENCY_UNAVAILABLE';
  override readonly category = ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE;

  constructor(operation: RateLimitStoreOperation, cause?: unknown) {
    super('Rate limiting storage is unavailable', {
      cause,
      metadata: {
        dependency: 'redis',
        operation,
      },
    });
  }
}
