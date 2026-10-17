import { HttpStatus } from '@nestjs/common';

import type { FieldValidationIssue } from '../../application/errors/input-validation.error.js';
import {
  AppError,
  type ErrorTranslationParams,
} from '../../errors/app-error.js';
import {
  ERROR_CATEGORY,
  type ErrorCategory,
} from '../../errors/error-category.js';

export type PublicErrorCategory = ErrorCategory | 'internal';

export interface PublicErrorResponse {
  readonly code: string;
  readonly category: PublicErrorCategory;
  readonly requestId: string;
  readonly params?: ErrorTranslationParams;
  readonly fields?: readonly FieldValidationIssue[];
}

/**
 * Transport-specific defaults. Keep HTTP status codes out of shared semantic errors.
 * Additions to ErrorCategory must be handled here at compile time.
 */
export const ERROR_CATEGORY_TO_HTTP_STATUS: Record<ErrorCategory, HttpStatus> =
  {
    [ERROR_CATEGORY.VALIDATION]: HttpStatus.BAD_REQUEST,
    [ERROR_CATEGORY.AUTHENTICATION]: HttpStatus.UNAUTHORIZED,
    [ERROR_CATEGORY.AUTHORIZATION]: HttpStatus.FORBIDDEN,
    [ERROR_CATEGORY.NOT_FOUND]: HttpStatus.NOT_FOUND,
    [ERROR_CATEGORY.CONFLICT]: HttpStatus.CONFLICT,
    [ERROR_CATEGORY.BUSINESS_RULE]: HttpStatus.UNPROCESSABLE_ENTITY,
    [ERROR_CATEGORY.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
    [ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
    [ERROR_CATEGORY.REQUEST_ERROR]: HttpStatus.BAD_REQUEST,
  };

export function resolveHttpStatusForAppError(error: AppError): HttpStatus {
  return ERROR_CATEGORY_TO_HTTP_STATUS[error.category];
}

export interface SafeHttpExceptionMapping {
  readonly code: string;
  readonly category: ErrorCategory;
}

/** Maps ordinary Nest HTTP exceptions without reflecting their message/body. */
export function mapSafeHttpException(status: number): SafeHttpExceptionMapping {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
    case HttpStatus.PAYLOAD_TOO_LARGE:
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
      return {
        code: 'COMMON.INVALID_REQUEST',
        category: ERROR_CATEGORY.VALIDATION,
      };

    case HttpStatus.UNAUTHORIZED:
      return {
        code: 'COMMON.UNAUTHENTICATED',
        category: ERROR_CATEGORY.AUTHENTICATION,
      };

    case HttpStatus.FORBIDDEN:
      return {
        code: 'COMMON.FORBIDDEN',
        category: ERROR_CATEGORY.AUTHORIZATION,
      };

    case HttpStatus.NOT_FOUND:
      return {
        code: 'COMMON.ROUTE_NOT_FOUND',
        category: ERROR_CATEGORY.NOT_FOUND,
      };

    case HttpStatus.CONFLICT:
      return { code: 'COMMON.CONFLICT', category: ERROR_CATEGORY.CONFLICT };

    case HttpStatus.UNPROCESSABLE_ENTITY:
      return {
        code: 'COMMON.UNPROCESSABLE_REQUEST',
        category: ERROR_CATEGORY.BUSINESS_RULE,
      };

    case HttpStatus.TOO_MANY_REQUESTS:
      return {
        code: 'COMMON.RATE_LIMITED',
        category: ERROR_CATEGORY.RATE_LIMITED,
      };

    case HttpStatus.SERVICE_UNAVAILABLE:
      return {
        code: 'COMMON.DEPENDENCY_UNAVAILABLE',
        category: ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE,
      };

    default:
      return {
        code: 'COMMON.REQUEST_REJECTED',
        category: ERROR_CATEGORY.REQUEST_ERROR,
      };
  }
}
