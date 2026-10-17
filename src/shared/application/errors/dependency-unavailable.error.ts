import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { ApplicationError } from './application-error.js';

export class DependencyUnavailableError extends ApplicationError {
  readonly code = 'COMMON.DEPENDENCY_UNAVAILABLE';
  override readonly category = ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE;

  constructor(prismaCode: string, cause: unknown) {
    super('A required dependency is unavailable', {
      cause,
      metadata: {
        dependency: 'postgresql',
        prismaCode,
      },
    });
  }
}
