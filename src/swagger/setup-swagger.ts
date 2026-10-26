import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../shared/presentation/http/api-error-response.dto.js';

const OPENAPI_HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Documents the RFC 9457 fallback for every operation. Endpoint-specific
 * responses remain authoritative; `default` covers statuses not explicitly
 * listed by a controller decorator.
 */
export function addDefaultProblemDetailsResponses<
  T extends {
    readonly paths: Record<string, unknown>;
  },
>(document: T): T {
  const problemResponse = {
    description:
      'An undocumented error response using RFC 9457 Problem Details.',
    content: {
      'application/problem+json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
      },
    },
  };

  for (const pathItemValue of Object.values(document.paths)) {
    if (!isRecord(pathItemValue)) continue;

    for (const method of OPENAPI_HTTP_METHODS) {
      const operationValue = pathItemValue[method];
      if (!isRecord(operationValue)) continue;

      let responses = operationValue['responses'];
      if (!isRecord(responses)) {
        responses = {};
        operationValue['responses'] = responses;
      }

      // Do not overwrite endpoint-specific default responses.
      if (!Object.prototype.hasOwnProperty.call(responses, 'default')) {
        if (
          typeof responses !== 'object' ||
          responses === null ||
          Array.isArray(responses)
        ) {
          continue;
        }
        (responses as Record<string, unknown>)['default'] ??= problemResponse;
      }
    }
  }

  return document;
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Tarkhineh Backend API')
    .setDescription('OpenAPI documentation for the Tarkhineh backend services.')
    .setVersion('0.0.1')
    .addTag('Health', 'Application health endpoints')
    .addTag(
      'Identity & Access',
      'Registration, authentication, and email verification',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter an access token issued by the login endpoint.',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
    extraModels: [ApiErrorResponseDto],
  });

  addDefaultProblemDetailsResponses(document);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'Tarkhineh API Documentation',
    swaggerOptions: {
      persistAuthorization: false,
      displayRequestDuration: true,
      filter: true,
      docExpansion: 'list',
    },
  });
}
