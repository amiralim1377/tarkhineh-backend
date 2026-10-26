import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ERROR_CATEGORY } from '../../errors/error-category.js';
import {
  createPublicProblemDetails,
  ERROR_CATEGORY_TO_HTTP_STATUS,
  mapSafeHttpException,
} from './http-error-mapper.js';

describe('HTTP error mapper', () => {
  it('maps every semantic error category to a default HTTP status', () => {
    expect(ERROR_CATEGORY_TO_HTTP_STATUS).toEqual({
      validation: HttpStatus.BAD_REQUEST,
      authentication: HttpStatus.UNAUTHORIZED,
      authorization: HttpStatus.FORBIDDEN,
      not_found: HttpStatus.NOT_FOUND,
      conflict: HttpStatus.CONFLICT,
      business_rule: HttpStatus.UNPROCESSABLE_ENTITY,
      rate_limited: HttpStatus.TOO_MANY_REQUESTS,
      dependency_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
      request_error: HttpStatus.BAD_REQUEST,
    });

    expect(Object.values(ERROR_CATEGORY_TO_HTTP_STATUS)).toHaveLength(
      Object.keys(ERROR_CATEGORY).length,
    );
  });

  it('creates an RFC 9457 Problem Details document and preserves safe extensions', () => {
    expect(
      createPublicProblemDetails(422, 'request-123', {
        code: 'TEST.EXAMPLE_FAILURE',
        category: ERROR_CATEGORY.BUSINESS_RULE,
        params: { min: 2 },
      }),
    ).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: 422,
      instance: '/problem-occurrences/request-123',
      code: 'TEST.EXAMPLE_FAILURE',
      category: ERROR_CATEGORY.BUSINESS_RULE,
      requestId: 'request-123',
      params: { min: 2 },
    });
  });

  it('uses the current HTTP reason phrase for common status titles', () => {
    expect(
      createPublicProblemDetails(HttpStatus.BAD_REQUEST, 'req-400', {
        code: 'COMMON.INVALID_REQUEST',
        category: ERROR_CATEGORY.VALIDATION,
      }),
    ).toMatchObject({ type: 'about:blank', title: 'Bad Request', status: 400 });

    expect(
      createPublicProblemDetails(HttpStatus.PAYLOAD_TOO_LARGE, 'req-413', {
        code: 'COMMON.INVALID_REQUEST',
        category: ERROR_CATEGORY.VALIDATION,
      }),
    ).toMatchObject({ title: 'Content Too Large', status: 413 });
  });

  it('maps standard HTTP exceptions without exposing exception messages', () => {
    expect(mapSafeHttpException(HttpStatus.UNAUTHORIZED)).toEqual({
      code: 'COMMON.UNAUTHENTICATED',
      category: ERROR_CATEGORY.AUTHENTICATION,
    });

    expect(mapSafeHttpException(HttpStatus.NOT_FOUND)).toEqual({
      code: 'COMMON.ROUTE_NOT_FOUND',
      category: ERROR_CATEGORY.NOT_FOUND,
    });
  });

  it('uses a safe request error for other client statuses', () => {
    expect(mapSafeHttpException(HttpStatus.METHOD_NOT_ALLOWED)).toEqual({
      code: 'COMMON.REQUEST_REJECTED',
      category: ERROR_CATEGORY.REQUEST_ERROR,
    });
  });
});
