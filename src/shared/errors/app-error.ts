import type { ErrorCategory } from './error-category.js';

export type SafeTranslationPrimitive = string | number | boolean;

/**
 * Public-safe parameters for frontend translation interpolation.
 * Only explicitly allowlisted values should be passed by concrete errors.
 */
export type ErrorTranslationParams = Readonly<
  Record<string, SafeTranslationPrimitive>
>;

/**
 * Internal diagnostic context. Never serialize this property into API responses.
 * Values must be reviewed before they are written to logs.
 */
export type ErrorDiagnosticMetadata = Readonly<Record<string, unknown>>;

export interface AppErrorOptions extends ErrorOptions {
  readonly params?: ErrorTranslationParams;
  readonly metadata?: ErrorDiagnosticMetadata;
}

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;

  readonly params?: ErrorTranslationParams;
  readonly metadata?: ErrorDiagnosticMetadata;

  protected constructor(
    internalMessage: string,
    options: AppErrorOptions = {},
  ) {
    super(
      internalMessage,
      options.cause === undefined ? undefined : { cause: options.cause },
    );

    this.name = new.target.name;
    this.params = options.params
      ? Object.freeze({ ...options.params })
      : undefined;
    this.metadata = options.metadata
      ? Object.freeze({ ...options.metadata })
      : undefined;
  }
}
