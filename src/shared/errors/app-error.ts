import type { ErrorCategory } from './error-category.js';

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;

  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
