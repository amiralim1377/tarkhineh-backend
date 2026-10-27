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
  createPublicProblemDetails,
  mapSafeHttpException,
  type PublicErrorExtensions,
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
        const diagnosticType = metadata.diagnosticType;

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
            ...(typeof diagnosticType === 'string' ? { diagnosticType } : {}),
          },
          'Application dependency unavailable',
        );
      }

      const extensions: PublicErrorExtensions = {
        code: exception.code,
        category: exception.category,
        ...(exception.params ? { params: exception.params } : {}),
        ...(exception instanceof InputValidationError
          ? { fields: exception.fields }
          : {}),
      };

      this.sendProblem(response, status, requestId, extensions);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      // Never expose a 5xx HttpException message or response body.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logUnexpectedException(exception, requestId, method, path);

        if (status === HttpStatus.SERVICE_UNAVAILABLE) {
          this.sendProblem(response, status, requestId, {
            code: 'COMMON.DEPENDENCY_UNAVAILABLE',
            category: ERROR_CATEGORY.DEPENDENCY_UNAVAILABLE,
          });
          return;
        }

        this.sendProblem(
          response,
          HttpStatus.INTERNAL_SERVER_ERROR,
          requestId,
          {
            code: 'COMMON.INTERNAL_ERROR',
            category: 'internal',
          },
        );
        return;
      }

      const mapped = mapSafeHttpException(status);
      this.sendProblem(response, status, requestId, {
        code: mapped.code,
        category: mapped.category,
      });
      return;
    }

    this.logUnexpectedException(exception, requestId, method, path);
    this.sendProblem(response, HttpStatus.INTERNAL_SERVER_ERROR, requestId, {
      code: 'COMMON.INTERNAL_ERROR',
      category: 'internal',
    });
  }

  private sendProblem(
    response: Response,
    status: number,
    requestId: string,
    extensions: PublicErrorExtensions,
  ): void {
    // Set this before json(): Express otherwise defaults the response to application/json.
    response.setHeader('Content-Type', 'application/problem+json');
    response
      .status(status)
      .json(createPublicProblemDetails(status, requestId, extensions));
  }

  private logUnexpectedException(
    exception: unknown,
    requestId: string,
    method: string | undefined,
    path: string,
  ): void {
    const errorType =
      exception instanceof Error &&
      /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(exception.name)
        ? exception.name
        : 'UnknownError';

    const stackFrames =
      exception instanceof Error && exception.stack
        ? exception.stack
            .split('\n')
            .slice(1, 21)
            .map((line) =>
              line
                .replace(
                  /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>)]*/gi,
                  '[REDACTED_CONNECTION_URL]',
                )
                .replace(
                  /\b(password|passwd|pwd|token|secret|authorization)=([^\s&"']+)/gi,
                  '$1=[REDACTED]',
                ),
            )
            .join('\n')
            .slice(0, 5000)
        : undefined;

    this.logger.error(
      {
        requestId,
        method,
        path,
        errorType,
        ...(stackFrames ? { stackFrames } : {}),
      },
      'Unhandled exception at HTTP boundary',
    );
  }
}
