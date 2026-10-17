import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { InputValidationError } from '../../application/errors/input-validation.error.js';
import { AppError } from '../../errors/app-error.js';
import { ERROR_CATEGORY } from '../../errors/error-category.js';
import {
  mapSafeHttpException,
  PublicErrorResponse,
  resolveHttpStatusForAppError,
} from './http-error-mapper.js';

type RequestWithId = Request & { id?: string | number };

@Catch()
@Injectable()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalHttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId =
      request.id === undefined ? randomUUID() : String(request.id);
    const method = request.method;
    const path = (request.originalUrl ?? request.url ?? '/').split('?')[0];

    response.setHeader('X-Request-Id', requestId);

    if (exception instanceof AppError) {
      const status = resolveHttpStatusForAppError(exception);

      // Expected business/authentication/validation failures are not logged here
      // to avoid noisy duplicate logs. Dependency failures are operationally relevant.
      if (exception.category === ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE) {
        const metadata = exception.metadata ?? {};
        const dependency = metadata.dependency;
        const prismaCode = metadata.prismaCode;

        this.logger.error(
          {
            requestId,
            errorCode: exception.code,
            category: exception.category,
            errorName: exception.name,
            method,
            path,
            ...(typeof dependency === 'string' ? { dependency } : {}),
            ...(typeof prismaCode === 'string'
              ? { dependencyErrorCode: prismaCode }
              : {}),
          },
          'Application dependency unavailable',
        );
      }

      const body: PublicErrorResponse = {
        code: exception.code,
        category: exception.category,
        requestId,
        ...(exception.params ? { params: exception.params } : {}),
        ...(exception instanceof InputValidationError
          ? { fields: exception.fields }
          : {}),
      };

      response.status(status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      // Never expose a 5xx HttpException message or response body.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logUnexpectedException(exception, requestId, method, path);

        if (status === HttpStatus.SERVICE_UNAVAILABLE) {
          response.status(status).json({
            code: 'COMMON.DEPENDENCY_UNAVAILABLE',
            category: ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE,
            requestId,
          } satisfies PublicErrorResponse);
          return;
        }

        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          code: 'COMMON.INTERNAL_ERROR',
          category: 'internal',
          requestId,
        } satisfies PublicErrorResponse);
        return;
      }

      const mapped = mapSafeHttpException(status);
      response.status(status).json({
        code: mapped.code,
        category: mapped.category,
        requestId,
      } satisfies PublicErrorResponse);
      return;
    }

    this.logUnexpectedException(exception, requestId, method, path);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'COMMON.INTERNAL_ERROR',
      category: 'internal',
      requestId,
    } satisfies PublicErrorResponse);
  }

  private logUnexpectedException(
    exception: unknown,
    requestId: string,
    method: string | undefined,
    path: string,
  ): void {
    this.logger.error(
      {
        err: exception,
        requestId,
        method,
        path,
      },
      'Unhandled exception at HTTP boundary',
    );
  }
}
