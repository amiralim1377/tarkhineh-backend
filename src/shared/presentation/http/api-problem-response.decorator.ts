import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiResponse,
  getSchemaPath,
  type ApiResponseOptions,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from './api-error-response.dto.js';

type ProblemResponseOptions = Pick<ApiResponseOptions, 'description'>;

/**
 * Documents an HTTP error using RFC 9457's application/problem+json media type.
 * Application-specific extensions are defined by ApiErrorResponseDto.
 */
export function ApiProblemResponse(
  status: HttpStatus,
  options: ProblemResponseOptions = {},
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(ApiErrorResponseDto),
    ApiResponse({
      ...options,
      status,
      content: {
        'application/problem+json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        },
      },
    }),
  );
}

export const ApiProblemBadRequestResponse = (
  options: ProblemResponseOptions = {},
): MethodDecorator & ClassDecorator =>
  ApiProblemResponse(HttpStatus.BAD_REQUEST, options);

export const ApiProblemUnauthorizedResponse = (
  options: ProblemResponseOptions = {},
): MethodDecorator & ClassDecorator =>
  ApiProblemResponse(HttpStatus.UNAUTHORIZED, options);

export const ApiProblemServiceUnavailableResponse = (
  options: ProblemResponseOptions = {},
): MethodDecorator & ClassDecorator =>
  ApiProblemResponse(HttpStatus.SERVICE_UNAVAILABLE, options);
