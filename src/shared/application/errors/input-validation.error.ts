import { ErrorTranslationParams } from '../../errors/app-error.js';
import { ERROR_CATEGORY } from '../../errors/error-category.js';
import { ApplicationError } from './application-error.js';

export interface FieldValidationIssue {
  /** A DTO field path defined by the API contract, or '$' for a request-level issue. */
  readonly field: string;
  /** Stable machine-readable validation code; never a framework message. */
  readonly code: string;
  /** Explicitly allowlisted primitive parameters for frontend translation. */
  readonly params?: ErrorTranslationParams;
}

export class InputValidationError extends ApplicationError {
  readonly code = 'COMMON.VALIDATION_FAILED';
  override readonly category = ERROR_CATEGORY.VALIDATION;
  readonly fields: readonly FieldValidationIssue[];

  constructor(fields: readonly FieldValidationIssue[]) {
    super('Input validation failed');

    this.fields = Object.freeze(
      fields.map((field) =>
        Object.freeze({
          field: field.field,
          code: field.code,
          ...(field.params
            ? { params: Object.freeze({ ...field.params }) }
            : {}),
        }),
      ),
    );
  }
}
